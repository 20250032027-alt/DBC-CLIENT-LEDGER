// Tally's numbers engine.
//
// Answers common money questions ("how much did we spend on travel this
// month?", "what's our profit?", "how did we do in July?") by COMPUTING
// them — the AI never invents a figure. It reuses the exact functions the
// Financial Reports page uses (postedOnly → buildLedger →
// buildFinancialSections → foldBillingIntoSections), so its totals for a
// period equal that page's Income Statement for the same date range.
//
// Runs entirely in the browser: instant, free, and nothing is sent
// anywhere. If a question isn't confidently understood, it returns null
// and the question goes to the AI instead — a wrong confident number is
// worse than a slightly slower answer.
import {
  fmt, isoDate, postedOnly, excludeClosingEntries, buildLedger, buildFinancialSections, foldBillingIntoSections, voucherTotals,
} from '../utils'

const MONTHS = [
  ['january', 'jan', 'enero'], ['february', 'feb', 'pebrero'], ['march', 'mar', 'marso'], ['april', 'apr', 'abril'],
  ['may', 'mayo'], ['june', 'jun', 'hunyo'], ['july', 'jul', 'hulyo'], ['august', 'aug', 'agosto'],
  ['september', 'sep', 'sept', 'setyembre'], ['october', 'oct', 'oktubre'], ['november', 'nov', 'nobyembre'], ['december', 'dec', 'disyembre'],
]
const MONTH_LABEL = i => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i]

const has = (q, re) => re.test(q)
const RE = {
  numeric: /how much|how many|magkano|\bilan\b|total|balance|summar|overview|recap|how did we do|how are we doing|kumusta ang|profit|net income|net loss|\bkita\b|kinita|tubo|gastos|nagastos|spent|spend|earn|biggest|largest|pinakamalaki|unpaid|overdue|outstanding|\bcash\b|\bpera\b|draft|unposted/,
  summary: /summar|overview|recap|how did we do|how are we doing|kumusta ang (negosyo|benta|buwan)|\bbuod\b/,
  profit: /profit|net income|net loss|\btubo\b|kinita|\bkita\b/,
  biggest: /biggest|largest|\btop\b|pinakamalaki/,
  spend: /spend|spent|expense|expenses|gastos|nagastos|gastusin|\bcost/,
  earn: /\bearn|revenue|\bsales\b|\bincome\b|\bsold\b|benta/,
  cash: /\bcash\b|\bbank\b|\bpera\b/,
  drafts: /draft|unposted|not (yet )?posted|hindi pa (naka-?)?post/,
  invoices: /unpaid|outstanding|overdue|receivable|collect|\butang\b|singil|hindi pa bayad/,
  skip: /\bwhy\b|\bbakit\b|\b(gj|sv|rj|dj|cv|jv)\s?\d{4}-\d+/,
  // "what is a cash voucher?", "how do I record expenses?" — explanations,
  // not requests for a figure. Only "how much / how many" overrides this.
  howTo: /\b(what is an?|what's an?|whats an?|what does|what are|how do i|how do we|how to|how can i|paano|explain|meaning of|where)\b/,
  asksAmount: /how much|how many|magkano|\bilan\b/,
}
// Words that describe the question, not an account's name.
const STOP = new Set(('how much many did we our my the a an on in for of to this last that is was are total spend spent spending expense expenses '
  + 'revenue sales income earn earned earning make made cash month year week today so far what whats what\'s much have has do does '
  + 'magkano ilan sa ng ang mga na pa nang ngayon ngayong buwan taon noong nakaraang gastos nagastos kita kinita benta all time overall').split(' '))

// ── dates ───────────────────────────────────────────────────────────────
function todayParts(now) { return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() } }
const monthPeriod = (y, m) => ({ from: isoDate(y, m, 1), to: isoDate(y, m + 1, 0), label: `${MONTH_LABEL(m)} ${y}` })

// Works out which dates a question is about, plus the period just before
// it for comparison. Questions with no date default to this month.
export function parsePeriod(q, now = new Date()) {
  const { y, m, d } = todayParts(now)
  const today = isoDate(y, m, d)
  if (has(q, /all[- ]time|overall|\bever\b|since the start/)) return { from: null, to: null, label: 'all time', prev: null }
  if (has(q, /\btoday\b|ngayong araw/)) return { from: today, to: today, label: 'today', prev: { from: isoDate(y, m, d - 1), to: isoDate(y, m, d - 1), label: 'yesterday' } }
  if (has(q, /last year|nakaraang taon/)) return { from: isoDate(y - 1, 0, 1), to: isoDate(y - 1, 11, 31), label: String(y - 1), prev: { from: isoDate(y - 2, 0, 1), to: isoDate(y - 2, 11, 31), label: String(y - 2) } }
  if (has(q, /this year|ngayong taon|so far|year[- ]to[- ]date|\bytd\b/)) return { from: isoDate(y, 0, 1), to: today, label: `${y} so far`, prev: { from: isoDate(y - 1, 0, 1), to: isoDate(y - 1, m, d), label: `the same point in ${y - 1}` } }
  const qm = q.match(/\bq([1-4])\b|\b(first|second|third|fourth)\s+quarter/)
  if (qm) {
    const n = qm[1] ? +qm[1] : ['first', 'second', 'third', 'fourth'].indexOf(qm[2]) + 1
    const ym = q.match(/\b(20\d\d)\b/); const yr = ym ? +ym[1] : y
    const p = (yy, nn) => ({ from: isoDate(yy, (nn - 1) * 3, 1), to: isoDate(yy, nn * 3, 0), label: `Q${nn} ${yy}` })
    return { ...p(yr, n), prev: n === 1 ? p(yr - 1, 4) : p(yr, n - 1) }
  }
  if (has(q, /last month|nakaraang buwan/)) return { ...monthPeriod(m === 0 ? y - 1 : y, (m + 11) % 12), prev: monthPeriod(m <= 1 ? y - 1 : y, (m + 10) % 12) }
  for (let i = 0; i < 12; i++) {
    if (MONTHS[i].some(n => new RegExp(`\\b${n}\\b`).test(q))) {
      // "may" is also an everyday English word — only treat it as the
      // month when it's clearly used as a date ("in May", "May 2026").
      if (i === 4 && !has(q, /\b(in|of|for|noong|last|this)\s+may\b|\bmay\s+20\d\d\b/)) continue
      const ym = q.match(/\b(20\d\d)\b/)
      const yr = ym ? +ym[1] : (i > m ? y - 1 : y) // a later month with no year means last year's
      return { ...monthPeriod(yr, i), prev: monthPeriod(i === 0 ? yr - 1 : yr, (i + 11) % 12) }
    }
  }
  return { ...monthPeriod(y, m), prev: monthPeriod(m === 0 ? y - 1 : y, (m + 11) % 12), defaulted: true }
}

// ── the same math as the reports ────────────────────────────────────────
const inPeriod = (date, p) => !p || ((!p.from || !date || date >= p.from) && (!p.to || !date || date <= p.to))

// Revenue & expense ACTIVITY for a period — mirrors the Income Statement:
// posted vouchers, closing entries left out, invoices folded in.
function activity(data, p) {
  const posted = postedOnly(data.vouchers)
  const vs = excludeClosingEntries(posted, data.periodClosings).filter(v => inPeriod(v.date, p))
  const sections = buildFinancialSections(buildLedger(vs), data.accounts, vs)
  foldBillingIntoSections(sections, (data.bills || []).filter(b => inPeriod(b.date, p)), posted)
  const sum = rows => rows.reduce((s, r) => s + r.amount, 0)
  return { revenue: sections.revenue, expenses: sections.expenses, totalRevenue: sum(sections.revenue), totalExpenses: sum(sections.expenses), vouchers: vs }
}

// Balances right now — mirrors the Balance Sheet: closing entries kept,
// and older invoices with no voucher folded in (a paid one shows as "Cash
// from Collections", exactly as the Balance Sheet lists it).
function balances(data) {
  const posted = postedOnly(data.vouchers)
  const sections = buildFinancialSections(buildLedger(posted), data.accounts, posted)
  return foldBillingIntoSections(sections, data.bills || [], posted)
}

// "travel" → "Travel and Transpo". Only counts real words from the
// account's name, never question words like "expense" or "total".
function matchAccount(q, accounts, prefer) {
  const words = q.split(/[^a-z0-9ñ]+/).filter(w => w.length >= 3 && !STOP.has(w))
  if (!words.length) return null
  let best = null
  for (const a of accounts) {
    const name = (a.name || '').toLowerCase()
    const tokens = name.split(/[^a-z0-9ñ]+/).filter(t => t.length >= 3 && !['and', 'the', 'for'].includes(t))
    let score = 0
    for (const w of words) if (tokens.some(t => t === w || (w.length >= 4 && (t.startsWith(w) || w.startsWith(t) && t.length >= 4)))) score++
    if (!score) continue
    if (prefer && a.type === prefer) score += 0.5
    if (!best || score > best.score) best = { account: a, score }
  }
  return best?.account || null
}

function compare(cur, prev, label, currency) {
  if (prev == null || label == null) return ''
  const diff = cur - prev
  if (Math.abs(diff) < 0.005) return ` That's the same as ${label}.`
  return ` That's ${fmt(Math.abs(diff), currency)} ${diff > 0 ? 'more' : 'less'} than ${label} (${fmt(prev, currency)}).`
}
function draftNote(data, p, accountName) {
  const n = data.vouchers.filter(v => v.posted === false && inPeriod(v.date, p) &&
    (!accountName || (v.entries || []).some(e => (e.account || '').trim().toLowerCase() === accountName.toLowerCase()))).length
  return n ? `\n\n${n} draft voucher${n !== 1 ? 's aren\'t' : ' isn\'t'} counted yet — drafts only count once they're posted.` : ''
}
const periodText = p => p.label === 'all time' ? 'all time' : p.label === 'today' ? 'today' : p.label

// ── the answers ─────────────────────────────────────────────────────────
// data = { vouchers, accounts, bills, settings, periodClosings }
// Returns { text, goto, computed: true } or null (= let the AI answer).
export function answerNumbers(question, data, now = new Date()) {
  const q = (question || '').toLowerCase().trim()
  if (!q || q.length > 200 || !has(q, RE.numeric) || has(q, RE.skip)) return null
  if (has(q, RE.howTo) && !has(q, RE.asksAmount)) return null
  const cur = data.settings?.currency
  const money = data.settings?.helpAssistantDataEnabled !== false
  const result = (text, goto) => ({ text, goto, computed: true })
  const moneyOff = result("Peso figures are turned off for this account, so I can't show amounts. An admin can turn them on in **Settings** → Help Assistant.", 'settings')

  // Counts only — fine even when peso figures are turned off.
  if (has(q, RE.drafts) && !has(q, RE.spend) && !has(q, RE.earn)) {
    const drafts = data.vouchers.filter(v => v.posted === false)
    if (!drafts.length) return result("You have **no draft vouchers** — everything's posted.", 'vouchers')
    const oldest = [...drafts].sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0]
    const unbalanced = drafts.filter(v => !voucherTotals(v.entries || []).balanced).length
    return result(`You have **${drafts.length} draft voucher${drafts.length !== 1 ? 's' : ''}** waiting to be posted. The oldest is ${oldest.number || 'unnumbered'}${oldest.date ? `, dated ${oldest.date}` : ''}.`
      + (unbalanced ? ` ${unbalanced} of them ${unbalanced !== 1 ? "don't" : "doesn't"} balance yet, so ${unbalanced !== 1 ? 'they' : 'it'} can't be posted until fixed.` : '')
      + '\n\nDrafts don\'t count in any report until they\'re posted. You\'ll find them in **Vouchers**.', 'vouchers')
  }

  if (!money) return moneyOff

  if (has(q, RE.invoices)) {
    const today = isoDate(now.getFullYear(), now.getMonth(), now.getDate())
    const unpaid = (data.bills || []).filter(b => b.status !== 'paid')
    if (!unpaid.length) return result('There are **no unpaid invoices** right now.', 'billing')
    const overdue = unpaid.filter(b => b.status === 'overdue' || (b.dueDate && b.dueDate < today))
    const total = list => list.reduce((s, b) => s + parseFloat(b.total || 0), 0)
    return result(`You have **${unpaid.length} unpaid invoice${unpaid.length !== 1 ? 's' : ''}** totaling **${fmt(total(unpaid), cur)}**.`
      + (overdue.length ? ` ${overdue.length} ${overdue.length !== 1 ? 'are' : 'is'} past due (${fmt(total(overdue), cur)}).` : ' None are past due.')
      + '\n\nSee them in **Billing**.', 'billing')
  }

  if (has(q, RE.cash) && !has(q, RE.spend) && !has(q, RE.earn)) {
    const rows = balances(data).currentAssets.filter(r => /cash|bank|petty/i.test(r.name))
    if (!rows.length) return result("I can't find a cash or bank account with posted activity yet. Your cash accounts are in **Chart of Accounts**.", 'accounts')
    const total = rows.reduce((s, r) => s + r.amount, 0)
    return result(`Cash on hand right now: **${fmt(total, cur)}**` + (rows.length > 1 ? ` (${rows.map(r => `${r.name.replace(' ⚠', '')} ${fmt(r.amount, cur)}`).join(', ')})` : '')
      + '.\n\nThat\'s from posted vouchers only. The full picture is in **Financial Reports**.', 'financial')
  }

  const p = parsePeriod(q, now)
  const a = activity(data, p)
  const pa = p.prev ? activity(data, p.prev) : null
  const net = a.totalRevenue - a.totalExpenses
  const netPrev = pa ? pa.totalRevenue - pa.totalExpenses : null
  const top = [...a.expenses].filter(r => r.amount > 0).sort((x, y) => y.amount - x.amount).slice(0, 3)
  const topText = top.map(r => `${r.name.replace(' ⚠', '')} ${fmt(r.amount, cur)}`).join(', ')

  if (has(q, RE.summary)) {
    const cashRows = balances(data).currentAssets.filter(r => /cash|bank|petty/i.test(r.name))
    const drafts = data.vouchers.filter(v => v.posted === false).length
    const lines = [
      `Here's **${periodText(p)}**${p.defaulted ? ' so far' : ''}:`,
      '',
      `- Revenue: **${fmt(a.totalRevenue, cur)}**`,
      `- Expenses: **${fmt(a.totalExpenses, cur)}**`,
      `- ${net >= 0 ? 'Net income' : 'Net loss'}: **${fmt(Math.abs(net), cur)}**` + (pa ? ` — ${p.prev.label}: ${netPrev >= 0 ? '' : 'loss of '}${fmt(Math.abs(netPrev), cur)}` : ''),
    ]
    if (top.length) lines.push(`- Biggest expenses: ${topText}`)
    if (cashRows.length) lines.push(`- Cash on hand now: ${fmt(cashRows.reduce((s, r) => s + r.amount, 0), cur)}`)
    if (drafts) lines.push(`- ${drafts} draft voucher${drafts !== 1 ? 's' : ''} not counted yet`)
    lines.push('', 'The full statements are in **Financial Reports**.')
    return result(lines.join('\n'), 'financial')
  }

  if (has(q, RE.profit)) {
    if (!a.totalRevenue && !a.totalExpenses) return result(`There's no posted revenue or expense activity for **${periodText(p)}**.` + draftNote(data, p), 'financial')
    return result(`For **${periodText(p)}**: revenue ${fmt(a.totalRevenue, cur)} minus expenses ${fmt(a.totalExpenses, cur)} = ${net >= 0 ? 'net income' : 'a net loss'} of **${fmt(Math.abs(net), cur)}**.`
      + (pa ? compare(net, netPrev, p.prev.label, cur).replace('more', 'better').replace('less', 'worse') : '') + draftNote(data, p) + '\n\nSee **Financial Reports** for the full statement.', 'financial')
  }

  if (has(q, RE.biggest) && (has(q, RE.spend) || !has(q, RE.earn))) {
    if (!top.length) return result(`There are no posted expenses for **${periodText(p)}**.` + draftNote(data, p), 'financial')
    return result(`Biggest expenses for **${periodText(p)}**:\n\n` + top.map((r, i) => `${i + 1}. ${r.name.replace(' ⚠', '')} — **${fmt(r.amount, cur)}**`).join('\n')
      + `\n\nTotal expenses: ${fmt(a.totalExpenses, cur)}. Drill into any account in **Account Listing**.`, 'account-listing')
  }

  const wantsSpend = has(q, RE.spend), wantsEarn = has(q, RE.earn)
  if (!wantsSpend && !wantsEarn) return null // a number question we don't confidently understand → the AI

  // A specific account ("travel", "rent", "communication")?
  const acct = matchAccount(q, data.accounts, wantsSpend ? 'expense' : 'revenue')
  if (acct && (acct.type === 'expense' || acct.type === 'revenue')) {
    const rows = acct.type === 'expense' ? a.expenses : a.revenue
    const prow = pa ? (acct.type === 'expense' ? pa.expenses : pa.revenue) : []
    const key = acct.name.trim().toLowerCase()
    const amount = rows.find(r => r.name.trim().toLowerCase() === key)?.amount || 0
    const prev = prow.find(r => r.name.trim().toLowerCase() === key)?.amount || 0
    const entries = a.vouchers.reduce((n, v) => n + (v.entries || []).filter(e => (e.account || '').trim().toLowerCase() === key).length, 0)
    const verb = acct.type === 'expense' ? 'spent' : 'earned'
    if (!amount) return result(`Nothing posted to **${acct.name}** for **${periodText(p)}**.` + draftNote(data, p, acct.name), 'account-listing')
    return result(`For **${periodText(p)}** you ${verb} **${fmt(amount, cur)}** on ${acct.name} (${entries} entr${entries !== 1 ? 'ies' : 'y'}).`
      + (pa ? compare(amount, prev, p.prev.label, cur) : '') + draftNote(data, p, acct.name)
      + '\n\nSee every entry in **Account Listing**.', 'account-listing')
  }

  // Totals for the whole category
  const isSpend = wantsSpend && !(wantsEarn && !has(q, /spend|spent|gastos|nagastos/))
  const total = isSpend ? a.totalExpenses : a.totalRevenue
  const prevTotal = pa ? (isSpend ? pa.totalExpenses : pa.totalRevenue) : null
  return result(`Total ${isSpend ? 'expenses' : 'revenue'} for **${periodText(p)}**: **${fmt(total, cur)}**.`
    + (pa ? compare(total, prevTotal, p.prev.label, cur) : '')
    + (isSpend && top.length ? `\n\nBiggest: ${topText}.` : '') + draftNote(data, p)
    + '\n\nThe breakdown is in **Financial Reports**.', 'financial')
}
