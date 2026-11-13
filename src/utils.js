export function fmt(num, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(num || 0)
}

export function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function fmtShort(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric',
  })
}

export function voucherTotals(entries = []) {
  let debit = 0, credit = 0
  entries.forEach(e => {
    debit += parseFloat(e.debit || 0)
    credit += parseFloat(e.credit || 0)
  })
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 }
}

// Formats a PH TIN as the user types, grouping digits 3-3-3-5
// (xxx-xxx-xxx-xxxxx). The last group is the 5-digit branch code (BIR
// assigns 00000 to individuals/head office). Non-digit characters are
// stripped so pasted values with dashes/spaces still format correctly.
export function formatTin(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 14)
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 14)]
  return groups.filter(Boolean).join('-')
}

// Called on blur: a 9-digit TIN (no branch code typed) automatically gets
// the standard 00000 branch code appended, formatted as xxx-xxx-xxx-00000.
export function normalizeTin(value) {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length === 9) return formatTin(digits + '00000')
  return formatTin(digits)
}

// Vouchers created through bulk import start as drafts (posted: false) and
// shouldn't affect real financial reports until someone reviews and posts
// them. Older vouchers (and every normal one entered by hand) have no
// `posted` field at all — treated as posted, so nothing already in the
// books disappears from reports because of this.
// Account names are matched ignoring capitalization and surrounding spaces:
// "Cash", "cash", "CASH" and " Cash " are all the same account. This is the
// rule the rest of the app already uses; these helpers just give it one name.
export const accountKey = name => (name || '').trim().toLowerCase()
export function findAccount(accounts = [], name) {
  const k = accountKey(name)
  return k ? accounts.find(a => accountKey(a.name) === k) : undefined
}
// Voucher lines with each account spelled exactly as in the Chart of
// Accounts. Names that aren't in the chart are left exactly as typed.
export function canonicalEntries(entries, accounts) {
  return (entries || []).map(e => {
    const a = findAccount(accounts, e.account)
    return a && e.account !== a.name ? { ...e, account: a.name } : e
  })
}

// ── Subsidiary ledgers: a balance per customer (Accounts Receivable) and
// per supplier (Accounts Payable). Customers and suppliers both come from
// the Clients list. The control accounts are recognized by type + name, so
// no setting is needed: an ASSET like "Accounts Receivable" / "Trade
// Receivables", or a LIABILITY like "Accounts Payable" / "Trade Payables".
// Tax accounts ("VAT Payable", "Withholding Tax Receivable"…) are owed to or
// by the BIR, not a customer or supplier, so they never match.
const RECEIVABLE_RE = /\b(accounts|trade)\s+receivables?\b|\breceivables?\s*[-–]\s*trade\b/i
const PAYABLE_RE = /\b(accounts|trade)\s+payables?\b|\bpayables?\s*[-–]\s*trade\b/i
export function subsidiaryKind(account) {
  if (!account) return null
  if (account.type === 'asset' && RECEIVABLE_RE.test(account.name || '')) return 'receivable'
  if (account.type === 'liability' && PAYABLE_RE.test(account.name || '')) return 'payable'
  return null
}
export const subsidiaryKindOf = (accounts, name) => subsidiaryKind(findAccount(accounts, name))
export function findClientByName(clients = [], name) {
  const k = accountKey(name)
  return k ? clients.find(c => accountKey(c.name) === k) : undefined
}

// Which customer/supplier a receivable/payable line belongs to, most
// specific first: the line's own pick → the voucher's Client → the invoice
// it was posted for (by invoice number) → a client named at the end of the
// memo ("Invoice — ABC Trading", how Billing writes them) → the payee.
// Only EXACT name matches count (ignoring capitalization) — no guessing.
export function lineClientId(v, e, ctx) {
  if (e.clientId) return e.clientId
  if (v.clientId) return v.clientId
  const bill = v.reference && ctx.billsByNumber.get(v.reference)
  if (bill?.clientId) return bill.clientId
  const m = (v.memo || '').match(/\u2014\s*([^\u2014]+)$/) // the "—" Billing puts before the client's name
  const byMemo = m && findClientByName(ctx.clients, m[1])
  if (byMemo) return byMemo.id
  const byPayee = v.payee && findClientByName(ctx.clients, v.payee)
  return byPayee ? byPayee.id : null
}

// kind: 'receivable' | 'payable'. Posted vouchers only, like every report.
// Balances are what the customer owes you (receivable) or what you owe the
// supplier (payable). Lines that can't be matched to a client are grouped
// as "unassigned", so the parts always add up to the control account.
export function buildSubsidiaryLedger({ vouchers = [], accounts = [], clients = [], bills = [], kind, asOf = null }) {
  const controls = accounts.filter(a => subsidiaryKind(a) === kind)
  const controlKeys = new Set(controls.map(a => accountKey(a.name)))
  const ctx = { clients, billsByNumber: new Map(bills.filter(b => b.number).map(b => [b.number, b])) }
  const known = new Set(clients.map(c => c.id))
  const sign = kind === 'receivable' ? 1 : -1
  const cents = x => Math.round(x * 100) / 100
  const groups = new Map()
  const posted = postedOnly(vouchers)
    .filter(v => !asOf || !v.date || v.date <= asOf)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.number || '').localeCompare(String(b.number || '')))
  for (const v of posted) {
    ;(v.entries || []).forEach((e, lineIndex) => {
      if (!controlKeys.has(accountKey(e.account))) return
      const debit = parseFloat(e.debit || 0) || 0
      const credit = parseFloat(e.credit || 0) || 0
      if (!debit && !credit) return
      const found = lineClientId(v, e, ctx)
      const key = found && known.has(found) ? found : null // a deleted client's lines show as unassigned
      if (!groups.has(key)) groups.set(key, { clientId: key, client: clients.find(c => c.id === key) || null, entries: [], balance: 0, debit: 0, credit: 0 })
      const g = groups.get(key)
      g.debit += debit; g.credit += credit
      g.balance = cents(g.balance + sign * (debit - credit))
      g.entries.push({ voucherId: v.id, lineIndex, date: v.date || '', number: v.number || '', description: e.description || v.memo || '', account: e.account, debit, credit, running: g.balance, explicit: !!e.clientId, dueDate: e.dueDate || null })
    })
  }
  const rows = [...groups.values()].filter(g => g.clientId).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || (a.client?.name || '').localeCompare(b.client?.name || ''))
  const unassigned = groups.get(null) || null
  const total = cents([...groups.values()].reduce((t, g) => t + g.balance, 0))
  return { controls: controls.map(a => a.name), rows, unassigned, total, assignedTotal: cents(rows.reduce((t, g) => t + g.balance, 0)) }
}

// ── Aging: each balance split by how long it has been outstanding ──
// Payments are applied to the oldest charges first (first in, first out),
// the standard method when payments aren't tied to specific invoices. What
// remains open is aged from its DUE date where known (a Billing invoice's
// due date, carried on its line), otherwise from the entry date — i.e. a
// manual entry is treated as due when it was recorded. A balance paid past
// zero (overpaid / advance) shows as a negative amount in "Current".
// Every row's buckets add up exactly to its balance.
export const AGING_BUCKETS = [
  { key: 'current', label: 'Current' },
  { key: 'd1_30', label: '1–30 days' },
  { key: 'd31_60', label: '31–60 days' },
  { key: 'd61_90', label: '61–90 days' },
  { key: 'd90', label: 'Over 90 days' },
]
function bucketFor(days) {
  if (days <= 0) return 'current'
  if (days <= 30) return 'd1_30'
  if (days <= 60) return 'd31_60'
  if (days <= 90) return 'd61_90'
  return 'd90'
}
const dayNumber = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000)

// ledger = buildSubsidiaryLedger(...) result. bills are used to find the
// due date of older invoice entries: same customer, same date, same amount
// — an exact match only; otherwise the entry date is used.
export function buildAging(ledger, { kind, asOf, bills = [] }) {
  const sign = kind === 'receivable' ? 1 : -1
  const cents = x => Math.round(x * 100) / 100
  const asOfDay = dayNumber(asOf)
  const dueFor = (g, e, amount) => {
    if (e.dueDate) return e.dueDate
    if (kind !== 'receivable' || !g.clientId) return null
    const b = bills.find(b => b.clientId === g.clientId && b.date === e.date && b.dueDate && Math.abs(parseFloat(b.total || 0) - amount) < 0.005)
    return b ? b.dueDate : null
  }
  const ageGroup = g => {
    const charges = [] // still-open amounts, oldest first
    let credit = 0
    for (const e of g.entries) {
      const amt = cents(sign * ((e.debit || 0) - (e.credit || 0)))
      if (amt > 0) charges.push({ amount: amt, due: dueFor(g, e, amt) || e.date || asOf, date: e.date })
      else if (amt < 0) credit += -amt
    }
    charges.sort((a, b) => a.due.localeCompare(b.due) || (a.date || '').localeCompare(b.date || ''))
    for (const c of charges) { // apply payments to the oldest first
      if (credit <= 0) break
      const used = Math.min(c.amount, credit)
      c.amount = cents(c.amount - used); credit = cents(credit - used)
    }
    const buckets = Object.fromEntries(AGING_BUCKETS.map(b => [b.key, 0]))
    let oldestDays = 0
    for (const c of charges) if (c.amount > 0) {
      const days = asOfDay - dayNumber(c.due)
      buckets[bucketFor(days)] = cents(buckets[bucketFor(days)] + c.amount)
      if (days > oldestDays) oldestDays = days
    }
    if (credit > 0) buckets.current = cents(buckets.current - credit)
    const overdue = cents(buckets.d1_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90)
    return { clientId: g.clientId, client: g.client, balance: g.balance, buckets, overdue, oldestDays }
  }
  const rows = ledger.rows.map(ageGroup)
  const unassigned = ledger.unassigned ? ageGroup(ledger.unassigned) : null
  const totals = Object.fromEntries(AGING_BUCKETS.map(b => [b.key, cents([...rows, ...(unassigned ? [unassigned] : [])].reduce((t, r) => t + r.buckets[b.key], 0))]))
  return { rows, unassigned, totals, total: ledger.total }
}

export function postedOnly(vouchers = []) {
  return vouchers.filter(v => v.posted !== false)
}

// A calendar date as "YYYY-MM-DD", built WITHOUT any timezone conversion.
// month is 0-based (like Date); day 0 means "last day of the previous
// month", so isoDate(y, m + 1, 0) is the last day of month m.
//
// Why this exists: new Date(y, m, d).toISOString() builds the date at
// local midnight and then converts it to UTC — in the Philippines (UTC+8)
// that's 4 PM the PREVIOUS day, so every date range came out one day
// early. Quarterly tax returns covered Dec 31 → Mar 30 instead of
// Jan 1 → Mar 31, putting last-day-of-quarter transactions in the wrong
// return.
// Today's date as "YYYY-MM-DD" in the device's own timezone. NOT
// new Date().toISOString().slice(0, 10) — that's the UTC date, which in the
// Philippines (UTC+8) is still YESTERDAY until 8 AM, so anything entered
// early in the morning was dated the day before (on the 1st: the previous
// month, or even the previous tax quarter).
export function todayLocal(d = new Date()) {
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate())
}

export function isoDate(year, month, day) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

// Closing Books posts a voucher that zeroes every Revenue and Expense
// account into equity. That voucher is real for BALANCES (Balance Sheet,
// Trial Balance, Account Listing — it's how the profit moves into
// Retained Earnings), but it is not a business transaction. Anything that
// reports ACTIVITY — the Income Statement, tax reports, Tally's "how much
// did we earn/spend" answers — must leave it out, or a closed period's
// revenue and expenses show up as zero.
export function closingVoucherIds(periodClosings = []) {
  return new Set(periodClosings.filter(p => !p.reopened && p.closingVoucherId).map(p => p.closingVoucherId))
}
export function excludeClosingEntries(vouchers = [], periodClosings = []) {
  const ids = closingVoucherIds(periodClosings)
  return ids.size ? vouchers.filter(v => !ids.has(v.id)) : vouchers
}

// Single source of truth for voucher number prefixes/titles, shared between
// the Vouchers page (assigning a number on save) and useStore's boot-time
// backfill (fixing pre-existing records that were saved without one).
export const VOUCHER_PREFIX = {
  sales: 'SV', general: 'GJ', 'cash receipt': 'RJ',
  'cash disbursement': 'DJ', expense: 'CV', adjustment: 'JV',
}
export const VOUCHER_TITLE = {
  sales: 'SALES VOUCHER', general: 'GENERAL JOURNAL', 'cash receipt': 'RECEIPT JOURNAL',
  'cash disbursement': 'DISBURSEMENT JOURNAL', expense: 'CASH VOUCHER', adjustment: 'JOURNAL VOUCHER',
}

// Resets each calendar year, per type — e.g. the 28th expense (Cash Voucher)
// created in 2026 becomes "CV 2026-028".
export function nextVoucherNumber(type, date, existingVouchers) {
  const year = (date || new Date().toISOString()).slice(0, 4)
  const prefix = VOUCHER_PREFIX[type] || 'GJ'
  const count = existingVouchers.filter(v => v.type === type && (v.number || '').includes(` ${year}-`)).length
  return `${prefix} ${year}-${String(count + 1).padStart(3, '0')}`
}

// ── Shared financial-statement calculation ──
// Extracted from FinancialCondition.jsx so the Financial Reports page and
// the Help Assistant's data summary both compute totals from the exact
// same code — they can't silently drift apart into showing different
// numbers for "Total Revenue," which is what was happening before this
// was shared (the assistant was improvising a simpler estimate that
// didn't know about accrual-basis invoice revenue, and disagreed with
// the real report).
export function coaTypeToSection(account) {
  const type = account.type
  if (type === 'asset') {
    const n = account.name.toLowerCase()
    if (n.includes('equipment') || n.includes('furniture') || n.includes('vehicle')
      || n.includes('building') || n.includes('land') || n.includes('property')) return 'fixed-asset'
    const code = parseInt(account.code || '0', 10)
    if (code >= 1500 && code < 2000) return 'fixed-asset'
    return 'current-asset'
  }
  if (type === 'liability') return 'current-liability'
  if (type === 'equity') return 'equity'
  if (type === 'revenue') return 'revenue'
  if (type === 'expense') return 'expense'
  return null
}

export function normalBalance(type) {
  return (type === 'asset' || type === 'expense') ? 1 : -1
}

export function buildLedger(vouchers) {
  const map = {}
  vouchers.forEach(v => {
    ;(v.entries || []).forEach(e => {
      if (!e.account) return
      const key = e.account.trim().toLowerCase()
      if (!map[key]) map[key] = { debit: 0, credit: 0 }
      map[key].debit += parseFloat(e.debit || 0)
      map[key].credit += parseFloat(e.credit || 0)
    })
  })
  return map
}

export function buildFinancialSections(ledger, accounts, vouchers) {
  const currentAssets = [], fixedAssets = [], currentLiabilities = [], equity = [], revenue = [], expenses = []

  accounts.forEach(account => {
    const section = coaTypeToSection(account)
    if (!section) return
    const key = account.name.trim().toLowerCase()
    const t = ledger[key] || { debit: 0, credit: 0 }
    if (t.debit === 0 && t.credit === 0) return
    const amount = (t.debit - t.credit) * normalBalance(account.type)
    const row = { name: account.name, amount }
    if (section === 'current-asset') currentAssets.push(row)
    else if (section === 'fixed-asset') fixedAssets.push(row)
    else if (section === 'current-liability') currentLiabilities.push(row)
    else if (section === 'equity') equity.push(row)
    else if (section === 'revenue') revenue.push(row)
    else if (section === 'expense') expenses.push(row)
  })

  const accountedFor = new Set(accounts.map(a => a.name.trim().toLowerCase()))
  Object.keys(ledger).forEach(key => {
    if (accountedFor.has(key)) return
    const originalName = (() => {
      for (const v of vouchers) {
        for (const e of (v.entries || [])) {
          if (e.account && e.account.trim().toLowerCase() === key) return e.account.trim()
        }
      }
      return key
    })()
    const t = ledger[key]
    const n = key
    if (n.includes('cash') || n.includes('bank') || n.includes('receivable') || n.includes('prepaid') || n.includes('inventory'))
      currentAssets.push({ name: originalName + ' ⚠', amount: t.debit - t.credit })
    else if (n.includes('equipment') || n.includes('furniture') || n.includes('vehicle') || n.includes('building'))
      fixedAssets.push({ name: originalName + ' ⚠', amount: t.debit - t.credit })
    else if (n.includes('payable') || n.includes('unearned') || n.includes('tax'))
      currentLiabilities.push({ name: originalName + ' ⚠', amount: t.credit - t.debit })
    else if (n.includes('capital') || n.includes('retained') || n.includes('equity'))
      equity.push({ name: originalName + ' ⚠', amount: t.credit - t.debit })
    else if (n.includes('revenue') || n.includes('sales') || n.includes('income'))
      revenue.push({ name: originalName + ' ⚠', amount: t.credit - t.debit })
    else if (n.includes('expense') || n.includes('cost') || n.includes('salaries') || n.includes('rent') || n.includes('utilities') || n.includes('supplies'))
      expenses.push({ name: originalName + ' ⚠', amount: t.debit - t.credit })
    else
      currentAssets.push({ name: originalName + ' ⚠ (unclassified)', amount: t.debit - t.credit })
  })

  return { currentAssets, fixedAssets, currentLiabilities, equity, revenue, expenses }
}

// Folds accrual-basis invoice revenue into the sections above, exactly as
// FinancialCondition.jsx does: revenue is recognized when an invoice is
// issued, not when it's paid. Bills that already auto-posted their own
// voucher (reference === bill number) are skipped here since they're
// already in the ledger — only "legacy" bills with no matching voucher
// need this fallback, or they'd get counted twice.
export function foldBillingIntoSections(sections, bills, vouchers) {
  const billHasVoucher = b => vouchers.some(v => v.reference === b.number)
  const legacyBills = bills.filter(b => !billHasVoucher(b))
  const paidBills = legacyBills.filter(b => b.status === 'paid').reduce((s, b) => s + parseFloat(b.total || 0), 0)
  const unpaidBills = legacyBills.filter(b => b.status !== 'paid').reduce((s, b) => s + parseFloat(b.total || 0), 0)
  if (paidBills > 0) sections.currentAssets.push({ name: 'Cash from Collections', amount: paidBills })
  if (unpaidBills > 0) sections.currentAssets.push({ name: 'Accounts Receivable (Invoices)', amount: unpaidBills })
  const allBills = paidBills + unpaidBills
  if (allBills > 0) {
    const existing = sections.revenue.find(r => r.name === 'Service Revenue')
    if (existing) existing.amount += allBills
    else sections.revenue.push({ name: 'Billing Revenue (Invoiced)', amount: allBills })
  }
  return sections
}

export function nextBillNumber(date, existingBills) {
  const year = (date || new Date().toISOString()).slice(0, 4)
  const count = existingBills.filter(b => (b.number || '').includes(` ${year}-`)).length
  return `INV ${year}-${String(count + 1).padStart(3, '0')}`
}

export function nextPosSaleNumber(date, existingSales) {
  const year = (date || new Date().toISOString()).slice(0, 4)
  const count = existingSales.filter(s => (s.number || '').includes(` ${year}-`)).length
  return `POS ${year}-${String(count + 1).padStart(3, '0')}`
}

// ── Password hashing for the deletion password and Team Member passwords ──
// Uses the browser's built-in Web Crypto API (SubtleCrypto) — no external
// dependency needed. Salted SHA-256, not bcrypt/Argon2: this app has no
// server to run a deliberately-slow hash on, and these passwords protect
// a delete-confirmation step and a tab-view restriction, not a real login.
// See migrations/008_password_hashing.sql for the full explanation of
// what this does and doesn't protect against.

export function generateSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function hashSecret(secret, salt) {
  const data = new TextEncoder().encode(`${salt}:${secret}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifySecret(secret, salt, hash) {
  if (!hash) return false
  return (await hashSecret(secret, salt)) === hash
}

// ── Help chat data summary ──
// Built fresh on every chat message from data already loaded in the app —
// no new database queries.
//
// On Team Member permissions: this does NOT hide numbers from restricted
// members — the app itself already shows every tab's real data to
// everyone, just read-only on some tabs. Filtering the summary while the
// screen right next to it shows the same numbers wouldn't protect
// anything, it would just make the bot less useful than the app it's
// sitting inside. What this DOES do is tell the model who's asking and
// what they can/can't edit, so it can avoid steering someone toward an
// action they don't have permission to take.
//
// On settings.helpAssistantDataEnabled (Settings > Help Assistant, on by
// default): when off, the summary sticks to structural counts (how many
// vouchers, how many clients) and leaves out every peso figure — no
// balances, no invoice totals, no individual voucher entries. This is an
// account-wide switch, not per Team Member, since it's a decision about
// whether the AI vendor sees real financial figures at all, not about who
// on the team can see what — that's already handled by permissions.
//
// IMPORTANT: the totals below are computed with the exact same functions
// (buildLedger/buildFinancialSections/foldBillingIntoSections) that the
// Financial Reports page uses — this used to be a separate, simpler
// calculation that didn't know about accrual-basis invoice revenue, which
// is exactly why it once disagreed with what was on screen. Sharing the
// same code means that can't happen again; if these ever look wrong, the
// bug is in the shared function, not a second copy of the math.

// Every posted voucher goes in, in full, with its debit/credit entries —
// not just a "recent N." A small business's yearly voucher count is
// nowhere near enough to strain Gemini's 1M-token context, and a partial
// window was exactly how the revenue mismatch happened before (questions
// about totals got answered from whatever fit in the window instead of
// everything). If this account ever grows into genuinely large voucher
// volumes and this starts costing real money or slowing responses down,
// that's the point to revisit a smarter approach (e.g. only fetching
// detail for the period actually asked about) — not before.
const MAX_DRAFT_VOUCHERS_LISTED = 100

function formatVoucherLine(v, cur) {
  const who = v.payee || v.clientName || ''
  const header = `- ${v.number || '(no number)'} — ${v.date || ''} — ${VOUCHER_TITLE[v.type] || v.type}${who ? ` — ${who}` : ''}${v.memo ? ` — "${v.memo}"` : ''}`
  const entryLines = (v.entries || []).map(e => {
    const debit = parseFloat(e.debit || 0)
    const credit = parseFloat(e.credit || 0)
    if (debit > 0) return `    Dr ${e.account}  ${fmt(debit, cur)}`
    if (credit > 0) return `    Cr ${e.account}  ${fmt(credit, cur)}`
    return null
  }).filter(Boolean)
  return [header, ...entryLines].join('\n')
}

export function buildDataSummary({ vouchers, clients, bills, accounts, settings, activeMember, teamPages, page, periodClosings = [] }) {
  // postedOnly() — NOT a plain `v.posted` check — for the same reason the
  // rest of the app uses it: a voucher with no `posted` field at all
  // (legacy data) defaults to counted-as-posted here too. Using a
  // different rule than the rest of the app was its own separate source
  // of drift from what's on screen.
  const posted = postedOnly(vouchers)
  const drafts = vouchers.filter(v => v.posted === false)
  const cur = settings.currency
  const numbersEnabled = settings.helpAssistantDataEnabled !== false

  const outstanding = bills.filter(b => b.status !== 'paid')
  const overdue = bills.filter(b => b.status === 'overdue')

  const lines = []
  lines.push(`As of: ${new Date().toLocaleString('en-PH')}`)
  lines.push('')
  lines.push('VOUCHERS')
  lines.push(`- Total: ${vouchers.length} (${drafts.length} draft, ${posted.length} posted)`)
  lines.push('')
  lines.push('CLIENTS')
  if (clients.length === 0) {
    lines.push('- None registered yet.')
  } else {
    clients.forEach(c => {
      lines.push(`- ${c.name}${c.company ? ` (${c.company})` : ''} — ${c.type || 'individual'}${c.tin ? `, TIN ${c.tin}` : ''}${c.email ? `, ${c.email}` : ''}`)
    })
  }
  lines.push('')
  lines.push('BILLING')
  lines.push(`- Outstanding invoices: ${outstanding.length}`)
  lines.push(`- Overdue: ${overdue.length}`)

  if (!numbersEnabled) {
    lines.push('')
    lines.push('FINANCIAL FIGURES: Turned off in Settings > Help Assistant. Do not state or estimate')
    lines.push('any peso amounts, balances, or totals — if asked for a number, say this is turned')
    lines.push('off for this account and an admin can enable it in Settings if they want the')
    lines.push('assistant to answer with real figures.')
  } else {
    // Exactly what the Financial Reports page computes — see the big
    // comment above.
    const ledger = buildLedger(posted)
    const sections = buildFinancialSections(ledger, accounts, posted)
    foldBillingIntoSections(sections, bills, posted)
    // Revenue & expenses as ACTIVITY — closing entries left out, exactly as
    // the Income Statement and Tally's own answers do. Otherwise, once a
    // period is closed, its revenue and expenses read as ₱0 here.
    const activity = excludeClosingEntries(posted, periodClosings)
    const activitySections = buildFinancialSections(buildLedger(activity), accounts, activity)
    foldBillingIntoSections(activitySections, bills, posted)
    const { currentAssets, fixedAssets, currentLiabilities, equity } = sections
    const { revenue, expenses } = activitySections

    const totalAssets = [...currentAssets, ...fixedAssets].reduce((s, r) => s + r.amount, 0)
    const totalLiabilities = currentLiabilities.reduce((s, r) => s + r.amount, 0)
    const totalEquity = equity.reduce((s, r) => s + r.amount, 0)
    const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0)
    const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0)
    const netIncome = totalRevenue - totalExpenses

    const outstandingTotal = outstanding.reduce((s, b) => s + parseFloat(b.total || 0), 0)
    lines.push(`- Outstanding total: ${fmt(outstandingTotal, cur)}`)

    lines.push('')
    lines.push('FINANCIAL POSITION (all-time, all posted vouchers — matches the Financial Reports')
    lines.push('page exactly; treat these five numbers as ground truth, don\'t re-derive them from')
    lines.push('the voucher list below)')
    lines.push(`- Total Assets: ${fmt(totalAssets, cur)}`)
    lines.push(`- Total Liabilities: ${fmt(totalLiabilities, cur)}`)
    lines.push(`- Total Equity: ${fmt(totalEquity, cur)}`)
    lines.push(`- Total Revenue: ${fmt(totalRevenue, cur)}`)
    lines.push(`- Total Expenses: ${fmt(totalExpenses, cur)}`)
    lines.push(`- Net Income: ${fmt(netIncome, cur)}`)
    if (periodClosings.some(p => !p.reopened)) {
      lines.push('- Note: Revenue, Expenses and Net Income above are ALL-TIME ACTIVITY (closing entries')
      lines.push('  excluded). Income from CLOSED periods has also been moved into Equity (e.g. Retained')
      lines.push('  Earnings) by the closing entries — never add Net Income and Equity together.')
    }

    lines.push('')
    lines.push('ALL ACCOUNT BALANCES WITH ACTIVITY (posted vouchers; "Billing Revenue (Invoiced)" and')
    lines.push('similar lines fold in invoices on an accrual basis, same as the Financial Reports page)')
    ;[...currentAssets, ...fixedAssets, ...currentLiabilities, ...equity, ...revenue, ...expenses].forEach(r => {
      lines.push(`- ${r.name}: ${fmt(r.amount, cur)}`)
    })

    if (posted.length > 0) {
      lines.push('')
      lines.push(`ALL POSTED VOUCHERS (${posted.length}, full debit/credit entries, most recent first) —`)
      lines.push('for "how many/what\'s my balance" questions use FINANCIAL POSITION above; use this')
      lines.push('list for questions about a SPECIFIC voucher or transaction')
      ;[...posted]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach(v => lines.push(formatVoucherLine(v, cur)))
    }

    if (drafts.length > 0) {
      lines.push('')
      lines.push(`DRAFT VOUCHERS (${drafts.length}, NOT posted — excluded from every total above and from`)
      lines.push(`all reports until posted; showing up to ${MAX_DRAFT_VOUCHERS_LISTED})`)
      drafts.slice(0, MAX_DRAFT_VOUCHERS_LISTED).forEach(v => lines.push(formatVoucherLine(v, cur)))
    }
  }

  lines.push('')
  lines.push(`TAX SCHEME: ${settings.taxScheme === 'vat' ? `VAT (${settings.vatRate}%)` : `Percentage Tax (${settings.percentageTaxRate}%)`}`)
  lines.push('')
  lines.push('CURRENT USER')
  if (activeMember) {
    lines.push(`- ${activeMember.name} (${activeMember.isAdmin ? 'admin — full access' : 'not admin'})`)
    if (!activeMember.isAdmin) {
      const editable = teamPages.filter(p => activeMember.permissions?.[p.id]).map(p => p.label)
      lines.push(`- Can EDIT: ${editable.length ? editable.join(', ') : 'nothing yet — ask an admin to grant tab access'}`)
      lines.push('- Every other tab is still visible to them with real data, but read-only — if they ask how to do something on a tab they can\'t edit, say they\'d need an admin to make that change, don\'t walk them through clicking a button they don\'t have.')
    }
  } else {
    lines.push('- Account owner / no Team Member profile selected — full access to everything.')
  }
  lines.push('')
  lines.push(`Currently viewing: ${page}`)

  return lines.join('\n')
}
