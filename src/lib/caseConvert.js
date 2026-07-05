export function toSnakeKey(k) { return k.replace(/[A-Z]/g, m => '_' + m.toLowerCase()) }
export function toCamelKey(k) { return k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()) }

const BILL_COLS = new Set([
  'id', 'user_id', 'created_at',
  'number', 'client_id', 'client_name', 'date', 'due_date', 'lines', 'notes',
  'apply_tax', 'subtotal', 'tax', 'total', 'status',
  'receivable_account', 'revenue_account', 'cash_account', 'paid_date',
  'updated_at',
])

// Local-only Dexie bookkeeping fields — never real DB columns, strip always.
const NEVER_SEND = new Set(['_dirty', '_deleted'])
// On UPDATE, don't touch identity/creation fields — id/userId shouldn't move,
// and createdAt should never be reset to sync time. On INSERT these are
// required (id so the local and remote copies share a primary key, userId
// for the RLS check, createdAt to preserve the real offline creation time).
const UPDATE_ONLY_STRIP = new Set(['id', 'userId', 'createdAt'])

export function toBillDb(obj, op = 'insert') {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (NEVER_SEND.has(k)) continue
    if (op === 'update' && UPDATE_ONLY_STRIP.has(k)) continue
    const snake = toSnakeKey(k)
    if (BILL_COLS.has(snake)) out[snake] = v === '' ? null : v
  }
  return out
}

export function toDb(obj, op = 'insert') {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (NEVER_SEND.has(k)) continue
    if (op === 'update' && UPDATE_ONLY_STRIP.has(k)) continue
    out[toSnakeKey(k)] = v === '' ? null : v
  }
  return out
}

export function fromDb(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    out[toCamelKey(k)] = v
  }
  return out
}
