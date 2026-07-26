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
export function postedOnly(vouchers = []) {
  return vouchers.filter(v => v.posted !== false)
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
