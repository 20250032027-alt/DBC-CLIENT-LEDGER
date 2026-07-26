// Starter Chart of Accounts, seeded once for a brand-new user so Vouchers
// and Trial Balance have something sensible to work with out of the box.
// Codes follow a conventional numbering block per account type.
export const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'asset', description: 'Cash on hand' },
  { code: '1010', name: 'Petty Cash', type: 'asset', description: 'Small day-to-day cash fund' },
  { code: '1020', name: 'Bank', type: 'asset', description: 'Bank account balances' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', description: 'Amounts owed by clients' },
  { code: '1200', name: 'Inventory', type: 'asset', description: 'Goods held for sale' },
  { code: '1300', name: 'Prepaid Expenses', type: 'asset', description: 'Expenses paid in advance' },
  { code: '1350', name: 'Input VAT', type: 'asset', description: 'Creditable input VAT on purchases (VAT-registered businesses)' },
  { code: '1400', name: 'Equipment', type: 'asset', description: 'Office and operating equipment' },
  { code: '2000', name: 'Accounts Payable', type: 'liability', description: 'Amounts owed to suppliers' },
  { code: '2100', name: 'Unearned Revenue', type: 'liability', description: 'Payments received for work not yet done' },
  { code: '2200', name: 'VAT Payable', type: 'liability', description: 'Output VAT due to the BIR (VAT-registered businesses)' },
  { code: '2210', name: 'Percentage Tax Payable', type: 'liability', description: 'Percentage tax due to the BIR (Non-VAT businesses)' },
  { code: '2220', name: 'Withholding Tax Payable', type: 'liability', description: 'Expanded/creditable withholding tax withheld from payees, due to the BIR' },
  { code: '3000', name: 'Capital', type: 'equity', description: "Owner's capital contribution" },
  { code: '3100', name: 'Retained Earnings', type: 'equity', description: 'Accumulated profits/losses' },
  { code: '4000', name: 'Sales Revenue', type: 'revenue', description: 'Revenue from goods sold' },
  { code: '4050', name: 'Sales Revenue - Exempt', type: 'revenue', description: 'VAT-exempt / zero-rated sales — post here instead of Sales Revenue so the Tax Report reports it correctly' },
  { code: '4060', name: 'Sales Revenue - Senior Citizen Discount', type: 'revenue', description: 'Sales to senior citizens (RA 9994) — VAT-exempt and reported separately, like Sales Revenue - Exempt' },
  { code: '4100', name: 'Service Revenue', type: 'revenue', description: 'Revenue from services rendered' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', description: 'Direct cost of goods sold' },
  { code: '5100', name: 'Salaries Expense', type: 'expense', description: 'Employee salaries and wages' },
  { code: '5200', name: 'Rent Expense', type: 'expense', description: 'Rent for office/premises' },
  { code: '5300', name: 'Utilities Expense', type: 'expense', description: 'Electricity, water, internet, etc.' },
  { code: '5400', name: 'Office Supplies', type: 'expense', description: 'Consumable office supplies' },
]
