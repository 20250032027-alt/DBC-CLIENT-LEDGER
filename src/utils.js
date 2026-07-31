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
// no new database queries. Deliberately kept to summary numbers, not raw
// transaction lists (dumping every voucher line into every request would
// be slow and expensive for no real benefit to a "how many/what's my
// balance" question).
//
// On Team Member permissions: this does NOT hide numbers from restricted
// members — the app itself already shows every tab's real data to
// everyone, just read-only on some tabs. Filtering the summary while the
// screen right next to it shows the same numbers wouldn't protect
// anything, it would just make the bot less useful than the app it's
// sitting inside. What this DOES do is tell the model who's asking and
// what they can/can't edit, so it can avoid steering someone toward an
// action they don't have permission to take.
const KEY_BALANCE_ACCOUNTS = [
  'Cash', 'Accounts Receivable', 'Accounts Payable',
  'Withholding Tax Payable', 'Withholding Tax Receivable',
  'VAT Payable', 'Percentage Tax Payable', 'Input VAT',
]

export function buildDataSummary({ vouchers, clients, bills, accounts, settings, activeMember, teamPages, page }) {
  const posted = vouchers.filter(v => v.posted)
  const drafts = vouchers.filter(v => !v.posted)
  const cur = settings.currency

  // Same normal-balance logic Trial Balance/Financial Reports use: asset
  // and expense accounts increase with a debit, everything else increases
  // with a credit.
  const balances = {}
  posted.forEach(v => {
    ;(v.entries || []).forEach(e => {
      if (!e.account) return
      const acct = accounts.find(a => a.name === e.account)
      const normal = acct && (acct.type === 'asset' || acct.type === 'expense') ? 1 : -1
      const debit = parseFloat(e.debit || 0)
      const credit = parseFloat(e.credit || 0)
      balances[e.account] = (balances[e.account] || 0) + normal * (debit - credit)
    })
  })

  const outstanding = bills.filter(b => b.status !== 'paid')
  const overdue = bills.filter(b => b.status === 'overdue')
  const outstandingTotal = outstanding.reduce((s, b) => s + parseFloat(b.total || 0), 0)

  const lines = []
  lines.push(`As of: ${new Date().toLocaleString('en-PH')}`)
  lines.push('')
  lines.push('VOUCHERS')
  lines.push(`- Total: ${vouchers.length} (${drafts.length} draft, ${posted.length} posted)`)
  lines.push('')
  lines.push('CLIENTS')
  lines.push(`- Total: ${clients.length}`)
  lines.push('')
  lines.push('BILLING')
  lines.push(`- Outstanding invoices: ${outstanding.length} (${fmt(outstandingTotal, cur)} total)`)
  lines.push(`- Overdue: ${overdue.length}`)
  lines.push('')
  lines.push('KEY BALANCES (from posted vouchers)')
  KEY_BALANCE_ACCOUNTS.forEach(name => {
    const acct = accounts.find(a => a.name.toLowerCase().includes(name.toLowerCase()))
    if (acct && balances[acct.name] !== undefined) {
      lines.push(`- ${acct.name}: ${fmt(balances[acct.name], cur)}`)
    }
  })
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
