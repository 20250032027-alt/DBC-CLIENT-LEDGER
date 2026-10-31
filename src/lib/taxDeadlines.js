// BIR filing reminders for the returns this app helps prepare.
//
// Rules (standard statutory due dates):
//   2550Q (VAT) / 2551Q (Percentage Tax) — 25 days after each quarter ends
//   1601-EQ (Expanded Withholding, quarterly) — last day of the month after the quarter
//   0619-E (Expanded Withholding, monthly) — 10th of the following month, for the
//     first two months of each quarter only (the third is covered by 1601-EQ)
// When a due date falls on a Saturday, Sunday or holiday, BIR moves it to the
// next business day (RMC No. 65-2016).
//
// Safety rule: the STATUTORY date is always shown first, with a note when a
// weekend moves it. Holidays are declared by proclamation and can't be known
// in advance, so they're never applied — Tally may remind someone early, but
// never names a date later than the real one.
//
// Only returns this app actually prepares: the sales-tax return matching the
// tax scheme in Settings, and the EWT returns only if the books use
// Withholding Tax Payable. Income tax returns (1701Q/1702Q) are left out — the
// app doesn't prepare them, and their dates differ for individuals vs
// corporations, which the app can't tell apart.
import { isoDate, postedOnly } from '../utils'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const QSPAN = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const utc = s => new Date(s + 'T00:00:00Z')
const label = s => { const d = utc(s); return `${DAY[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}` }
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000)

// Next business day if the date falls on a weekend (holidays not applied — see above).
function weekendMove(s) {
  const dow = utc(s).getUTCDay()
  if (dow !== 0 && dow !== 6) return null
  const d = utc(s); d.setUTCDate(d.getUTCDate() + (dow === 6 ? 2 : 1))
  return d.toISOString().slice(0, 10)
}

export function usesWithholding(vouchers = []) {
  return postedOnly(vouchers).some(v => (v.entries || []).some(e => (e.account || '').trim().toLowerCase() === 'withholding tax payable'))
}

// Returns deadlines due from today through `days` ahead, soonest first.
export function upcomingDeadlines({ settings = {}, vouchers = [] }, now = new Date(), days = 45) {
  const today = isoDate(now.getFullYear(), now.getMonth(), now.getDate())
  const until = isoDate(now.getFullYear(), now.getMonth(), now.getDate() + days)
  const vat = (settings.taxScheme || 'vat') === 'vat'
  const ewt = usesWithholding(vouchers)
  const all = []
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    for (let q = 1; q <= 4; q++) {
      const endMonth = q * 3 - 1 // 0-based month the quarter ends in
      all.push(vat
        ? { form: '2550Q', title: 'Quarterly VAT Return', period: `Q${q} ${y} (${QSPAN[q - 1]})`, due: isoDate(y, endMonth + 1, 25), goto: 'tax-return' }
        : { form: '2551Q', title: 'Quarterly Percentage Tax Return', period: `Q${q} ${y} (${QSPAN[q - 1]})`, due: isoDate(y, endMonth + 1, 25), goto: 'tax-return',
            note: 'Not needed if you chose the 8% income tax option.' })
      if (ewt) all.push({ form: '1601-EQ', title: 'Quarterly Expanded Withholding Tax', period: `Q${q} ${y} (${QSPAN[q - 1]})`, due: isoDate(y, endMonth + 2, 0), goto: 'ewt-report' })
    }
    if (ewt) for (const m of [0, 1, 3, 4, 6, 7, 9, 10]) {
      all.push({ form: '0619-E', title: 'Monthly Expanded Withholding Tax', period: `${MONTH[m]} ${y}`, due: isoDate(y, m + 1, 10), goto: 'ewt-report' })
    }
  }
  return all
    .filter(d => d.due >= today && d.due <= until)
    .sort((a, b) => a.due.localeCompare(b.due))
    .map(d => {
      const moved = weekendMove(d.due)
      const left = daysBetween(today, d.due)
      return { ...d, dueLabel: label(d.due), movedTo: moved, movedLabel: moved ? label(moved) : null, daysLeft: left,
        whenText: left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days` }
    })
}

export const DEADLINE_QUESTION = /deadline|due date|when (is|are) .*(tax|bir|return|2551|2550|1601|0619)|kailan .*(deadline|tax|buwis|bayad)|next (tax|filing|bir)|bir (calendar|deadline)/i

export const DEADLINE_CAVEAT = 'These are the standard BIR due dates for the returns this app helps prepare. When one falls on a weekend or holiday, BIR moves it to the next working day — but filing early is always safe. Confirm with your accountant, especially for eFPS filers.'
