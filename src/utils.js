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

export function nextBillNumber(date, existingBills) {
  const year = (date || new Date().toISOString()).slice(0, 4)
  const count = existingBills.filter(b => (b.number || '').includes(` ${year}-`)).length
  return `INV ${year}-${String(count + 1).padStart(3, '0')}`
}
