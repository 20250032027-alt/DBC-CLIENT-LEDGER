// Tally's "quick check of your books" — a few fast checks that catch real
// problems before an accountant does, each pointing to where to fix it.
// Counts only, never peso amounts, so it works even when financial
// figures are turned off for the assistant.
import { isoDate, postedOnly, voucherTotals } from '../utils'

const MONTH = i => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i]
const list = (vs, max = 2) => vs.slice(0, max).map(v => v.number || 'unnumbered').join(', ') + (vs.length > max ? ` and ${vs.length - max} more` : '')

// data = { vouchers, accounts, bills, periodClosings }
// Returns { items: [{ level: 'ok' | 'warn', text, goto }], issues }
export function checkBooks(data, now = new Date()) {
  const { vouchers = [], accounts = [], bills = [], periodClosings = [] } = data
  const today = isoDate(now.getFullYear(), now.getMonth(), now.getDate())
  const items = []
  const warn = (text, goto) => items.push({ level: 'warn', text, goto })
  const ok = (text, goto) => items.push({ level: 'ok', text, goto })

  if (!accounts.length) {
    warn('Your Chart of Accounts is empty — set it up first', 'accounts')
    return { items, issues: 1 }
  }

  const posted = postedOnly(vouchers)
  const drafts = vouchers.filter(v => v.posted === false)

  // Posted vouchers that don't balance throw the Trial Balance off.
  const badPosted = posted.filter(v => !voucherTotals(v.entries || []).balanced)
  if (badPosted.length) warn(`${badPosted.length} posted voucher${badPosted.length !== 1 ? 's don\'t' : ' doesn\'t'} balance (${list(badPosted)})`, 'vouchers')
  else if (posted.length) ok('Trial Balance tallies', 'trial-balance')

  const badDrafts = drafts.filter(v => !voucherTotals(v.entries || []).balanced)
  if (badDrafts.length) warn(`${badDrafts.length} draft${badDrafts.length !== 1 ? 's don\'t' : ' doesn\'t'} balance yet (${list(badDrafts)})`, 'vouchers')

  if (drafts.length) {
    const oldest = drafts.map(v => v.date).filter(Boolean).sort()[0]
    const days = oldest ? Math.floor((Date.parse(today) - Date.parse(oldest)) / 86400000) : 0
    warn(`${drafts.length} draft${drafts.length !== 1 ? 's' : ''} waiting to be posted` + (days >= 7 ? ` — the oldest is ${days} days old` : ''), 'vouchers')
  }

  // Entries on account names that aren't in the Chart of Accounts get
  // filed under "⚠" guesses in the reports.
  const known = new Set(accounts.map(a => (a.name || '').trim().toLowerCase()))
  const unknown = new Set()
  posted.forEach(v => (v.entries || []).forEach(e => { const n = (e.account || '').trim(); if (n && !known.has(n.toLowerCase())) unknown.add(n) }))
  if (unknown.size) warn(`${unknown.size} account name${unknown.size !== 1 ? 's' : ''} in posted vouchers ${unknown.size !== 1 ? 'aren\'t' : 'isn\'t'} in your Chart of Accounts (${[...unknown].slice(0, 2).join(', ')}${unknown.size > 2 ? '…' : ''})`, 'accounts')

  const overdue = bills.filter(b => b.status !== 'paid' && (b.status === 'overdue' || (b.dueDate && b.dueDate < today)))
  if (overdue.length) warn(`${overdue.length} invoice${overdue.length !== 1 ? 's are' : ' is'} past due`, 'billing')

  // Only for businesses that already close their books — otherwise it's noise.
  const open = periodClosings.filter(p => !p.reopened)
  if (open.length) {
    const latest = open.map(p => p.closedThrough).sort().pop()
    const lastMonthEnd = isoDate(now.getFullYear(), now.getMonth(), 0)
    if (latest < lastMonthEnd) {
      const d = new Date(lastMonthEnd + 'T00:00:00Z')
      warn(`${MONTH(d.getUTCMonth())} isn't closed yet`, 'closing-books')
    }
  }

  return { items, issues: items.filter(i => i.level === 'warn').length }
}
