// Backup & restore — the whole ledger as one Excel file, and back again.
//
// The file is meant to be readable: one sheet per kind of data, Vouchers
// with one row per line. Every record keeps its id, so restoring the same
// file twice never creates duplicates. A cover sheet ("About this backup")
// identifies the file, so a random spreadsheet can't be restored by mistake.
//
// Never included: passwords (the deletion password's hash/salt and Team
// Member passwords — an Excel file gets emailed and copied around) and
// receipt attachments (those are files, not spreadsheet data).
//
// These functions take the SheetJS module as an argument, so they work
// both in the app (loaded on demand) and in tests.

export const BACKUP_FORMAT = 'DBC Ledger backup'
export const BACKUP_VERSION = 1
const ABOUT_SHEET = 'About this backup'
const SETTINGS_SHEET = 'Company Settings'
const VOUCHER_SHEET = 'Vouchers'

// Restore order matters: things that others refer to come first, and
// closed periods come LAST — a closing locks its period, so the vouchers
// inside it must already be in place.
export const BACKUP_TABLES = [
  ['accounts', 'Accounts'],
  ['clients', 'Clients'],
  ['templates', 'Voucher Templates'],
  ['rawMaterials', 'Raw Materials'],
  ['products', 'Products'],
  ['assemblyItems', 'Recipes'],
  ['bills', 'Invoices'],
  ['invoices', 'Sales'],
  ['invoiceItems', 'Sales Items'],
  ['menuItems', 'Menu Items'],
  ['posSales', 'POS Sales'],
  ['vouchers', VOUCHER_SHEET],
  ['rawMaterialEntries', 'Stock Movements'],
  ['productionEntries', 'Production'],
  ['periodClosings', 'Closed Periods'],
]
const SECRET_SETTINGS = new Set(['deletePasswordHash', 'pwSalt', 'teamMembers'])
const JSON_SUFFIX = ' (json)'
const EXCEL_CELL_LIMIT = 32000 // Excel's hard limit is 32,767 characters

// Fields that belong to this device or this account, not to the record.
const isInternal = k => k.startsWith('_') || k === 'userId' || k === 'updatedAt'
function clean(rec) {
  const out = {}
  for (const [k, v] of Object.entries(rec || {})) if (!isInternal(k) && v !== undefined) out[k] = v
  return out
}
const isObj = v => v !== null && typeof v === 'object'
function toCell(v, where) {
  if (!isObj(v)) return v ?? ''
  const s = JSON.stringify(v)
  if (s.length > EXCEL_CELL_LIMIT) throw new Error(`${where} is too large to fit in one Excel cell.`)
  return s
}

// ── Build ────────────────────────────────────────────────────────────────
// data: { accounts, clients, vouchers, ..., settings }, meta: { company, createdAt }
export function buildBackupWorkbook(XLSX, data, meta = {}) {
  const wb = XLSX.utils.book_new()
  const counts = {}

  for (const [key, sheet] of BACKUP_TABLES) {
    const rows = data[key] || []
    counts[key] = rows.length
    if (key === 'vouchers') continue // built below, one row per line
    const records = rows.map(clean)
    const keys = [...new Set(records.flatMap(Object.keys))].sort((a, b) => (a === 'id' ? -1 : b === 'id' ? 1 : a.localeCompare(b)))
    const jsonKeys = new Set(keys.filter(k => records.some(r => isObj(r[k]))))
    const header = keys.map(k => (jsonKeys.has(k) ? k + JSON_SUFFIX : k))
    const aoa = [header, ...records.map(r => keys.map(k => toCell(r[k], `A ${sheet} record (${k})`)))]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa.length > 1 ? aoa : [header.length ? header : ['id']]), sheet)
  }

  // Vouchers: readable columns, one row per line. "Voucher data (json)" /
  // "Line data (json)" keep every other field so nothing is lost.
  const clientName = id => (data.clients || []).find(c => c.id === id)?.name || ''
  const VCOLS = ['Voucher ID', 'Number', 'Type', 'Date', 'Posted', 'Memo', 'Reference', 'Payee', 'Client',
    'Line', 'Account', 'Description', 'Debit', 'Credit', 'Line client', 'Voucher data (json)', 'Line data (json)']
  const vrows = [VCOLS]
  for (const v of (data.vouchers || []).map(clean)) {
    const { entries = [], ...rest } = v
    const lines = entries.length ? entries : [null]
    lines.forEach((e, i) => {
      const { account, description, debit, credit, ...lineRest } = e || {}
      vrows.push([
        v.id, v.number ?? '', v.type ?? '', v.date ?? '', v.posted === false ? 'No' : v.posted === true ? 'Yes' : '',
        v.memo ?? '', v.reference ?? '', v.payee ?? '', clientName(v.clientId),
        e ? i + 1 : '', account ?? '', description ?? '', num(debit), num(credit), e ? clientName(e.clientId) : '',
        i === 0 ? toCell(rest, `Voucher ${v.number || v.id}`) : '',
        e && Object.keys(lineRest).length ? toCell(lineRest, `Voucher ${v.number || v.id}, line ${i + 1}`) : '',
      ])
    })
  }
  const vws = XLSX.utils.aoa_to_sheet(vrows)
  vws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 11 }, { wch: 7 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 20 },
    { wch: 5 }, { wch: 24 }, { wch: 28 }, { wch: 13 }, { wch: 13 }, { wch: 18 }, { wch: 12 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, vws, VOUCHER_SHEET)

  const settings = clean(data.settings || {})
  const srows = [['Setting', 'Value'], ...Object.entries(settings).filter(([k]) => !SECRET_SETTINGS.has(k))
    .map(([k, v]) => [isObj(v) ? k + JSON_SUFFIX : k, toCell(v, `Setting ${k}`)])]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(srows), SETTINGS_SHEET)

  const about = [
    ['Format', BACKUP_FORMAT], ['Version', BACKUP_VERSION], ['Company', meta.company || ''], ['Created', meta.createdAt || new Date().toISOString()],
    [], ['What it contains', 'Records'],
    ...BACKUP_TABLES.map(([key, sheet]) => [sheet, counts[key]]),
    [], ['Notes', ''],
    ['', 'To restore: Settings → Data → Restore from backup.'],
    ['', 'Receipt photos and attachments are not included. Passwords are not included.'],
    ['', 'You can read and check this file freely. Don\'t rename the sheets or the "id" / "Voucher ID" columns, or it can\'t be restored.'],
  ]
  const aws = XLSX.utils.aoa_to_sheet(about); aws['!cols'] = [{ wch: 22 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, aws, ABOUT_SHEET)
  wb.SheetNames = [ABOUT_SHEET, ...wb.SheetNames.filter(n => n !== ABOUT_SHEET)] // cover sheet first
  return { wb, counts }
}
function num(v) {
  if (v === '' || v === null || v === undefined) return ''
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : v
}

// ── Read ─────────────────────────────────────────────────────────────────
// Returns { meta, tables: { key: [records] }, settings, errors }.
export function readBackupWorkbook(XLSX, wb) {
  const errors = []
  const sheet = name => wb.Sheets[name]
  const about = sheet(ABOUT_SHEET)
  const aboutRows = about ? XLSX.utils.sheet_to_json(about, { header: 1, defval: '' }) : []
  const field = label => aboutRows.find(r => r[0] === label)?.[1]
  if (field('Format') !== BACKUP_FORMAT) {
    return { meta: null, tables: {}, settings: null, errors: ["This isn't a DBC Ledger backup file. Use a file made with Settings → Data → Download backup."] }
  }
  const version = Number(field('Version'))
  if (!(version >= 1 && version <= BACKUP_VERSION)) errors.push(`This backup was made by a newer version of the app (format ${field('Version')}). Please update the app first.`)
  const meta = { company: field('Company') || '', createdAt: field('Created') || '', version }

  const tables = {}
  for (const [key, name] of BACKUP_TABLES) {
    const ws = sheet(name)
    if (!ws) continue
    if (key === 'vouchers') { tables.vouchers = readVouchers(XLSX, ws, errors); continue }
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
    tables[key] = rows.map((row, i) => {
      const rec = {}
      for (const [col, val] of Object.entries(row)) {
        if (val === '') continue
        if (col.endsWith(JSON_SUFFIX)) {
          try { rec[col.slice(0, -JSON_SUFFIX.length)] = JSON.parse(val) } catch { errors.push(`${name}, row ${i + 2}: "${col}" isn't valid data.`) }
        } else rec[col] = fromCell(val)
      }
      return rec
    }).filter(r => r.id || (errors.push(`${name}: a row has no id and was ignored.`), false))
  }

  let settings = null
  const sws = sheet(SETTINGS_SHEET)
  if (sws) {
    settings = {}
    for (const [k, v] of XLSX.utils.sheet_to_json(sws, { header: 1, defval: '' }).slice(1)) {
      if (!k) continue
      if (String(k).endsWith(JSON_SUFFIX)) { try { settings[String(k).slice(0, -JSON_SUFFIX.length)] = JSON.parse(v) } catch { /* skip bad value */ } }
      else if (!SECRET_SETTINGS.has(k)) settings[k] = fromCell(v)
    }
  }
  return { meta, tables, settings, errors }
}
// Excel may turn a date typed into a cell into a real date; store dates as text.
function fromCell(v) {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  return v
}
function readVouchers(XLSX, ws, errors) {
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  const byId = new Map()
  rows.forEach((r, i) => {
    const id = String(r['Voucher ID'] || '').trim()
    if (!id) { errors.push(`Vouchers, row ${i + 2}: no Voucher ID — ignored.`); return }
    if (!byId.has(id)) {
      let base = {}
      if (r['Voucher data (json)']) { try { base = JSON.parse(r['Voucher data (json)']) } catch { errors.push(`Vouchers, row ${i + 2}: voucher data isn't valid — rebuilt from the visible columns.`) } }
      const v = { ...base, id, entries: [] }
      // The readable columns win, so a corrected value in the sheet is used.
      for (const [col, key] of [['Number', 'number'], ['Type', 'type'], ['Date', 'date'], ['Memo', 'memo'], ['Reference', 'reference'], ['Payee', 'payee']]) {
        if (r[col] !== '') v[key] = fromCell(r[col]); else if (key in base && base[key] !== '' && base[key] !== null) delete v[key]
      }
      if (r.Posted === 'Yes') v.posted = true; else if (r.Posted === 'No') v.posted = false
      byId.set(id, v)
    }
    if (r.Line === '' && !r.Account) return // a voucher with no lines
    let extra = {}
    if (r['Line data (json)']) { try { extra = JSON.parse(r['Line data (json)']) } catch { errors.push(`Vouchers, row ${i + 2}: line data isn't valid — kept the visible columns only.`) } }
    byId.get(id).entries.push({ ...extra, account: String(r.Account ?? ''), description: String(r.Description ?? ''),
      debit: r.Debit === '' ? '' : String(r.Debit), credit: r.Credit === '' ? '' : String(r.Credit) })
  })
  return [...byId.values()]
}

// ── Plan ─────────────────────────────────────────────────────────────────
// mode 'merge'   — add only records that aren't in the app now; never changes existing ones.
// mode 'replace' — everything in the app is replaced by the backup.
// current: { key: [records] }, isDateLocked(date) → true inside a closed period.
// Returns what will happen, table by table, before anything is changed.
export function planRestore(backup, current, mode, { isDateLocked = () => false } = {}) {
  const steps = [] // [key, records] in restore order
  const summary = []
  let renumbered = 0
  for (const [key, label] of BACKUP_TABLES) {
    const incoming = backup.tables[key]
    if (!incoming) continue
    if (mode === 'replace') {
      steps.push([key, incoming])
      summary.push({ key, label, inBackup: incoming.length, toAdd: incoming.length, alreadyHere: 0, skipped: 0, reasons: [] })
      continue
    }
    const have = new Set((current[key] || []).map(r => r.id))
    const fresh = incoming.filter(r => !have.has(r.id))
    let add = fresh, skipped = 0
    const reasons = []
    if (key === 'vouchers') {
      add = fresh.filter(v => !isDateLocked(v.date))
      skipped = fresh.length - add.length
      if (skipped) reasons.push(`${skipped} dated in a closed period — reopen that period first, or use Replace`)
      // Don't create a second voucher with a number already in use: the
      // restored one gets the next free number instead.
      const usedNumbers = new Set((current.vouchers || []).map(v => v.number).filter(Boolean))
      add = add.map(v => (v.number && usedNumbers.has(v.number) ? (renumbered++, { ...v, number: null }) : v))
    }
    if (key === 'periodClosings') {
      // Adding a closing locks its period — only do it when its closing
      // voucher is there (already, or restored in this same run).
      const voucherIds = new Set([...(current.vouchers || []), ...(steps.find(s => s[0] === 'vouchers')?.[1] || [])].map(v => v.id))
      const ok = add.filter(p => !p.closingVoucherId || voucherIds.has(p.closingVoucherId))
      if (ok.length < add.length) reasons.push(`${add.length - ok.length} whose closing voucher isn't available`)
      skipped += add.length - ok.length
      add = ok
    }
    if (add.length) steps.push([key, add])
    summary.push({ key, label, inBackup: incoming.length, toAdd: add.length, alreadyHere: incoming.length - fresh.length, skipped, reasons })
  }
  return { mode, steps, summary, renumbered, settings: mode === 'replace' ? backup.settings : null }
}
