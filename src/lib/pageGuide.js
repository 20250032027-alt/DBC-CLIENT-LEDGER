// "Explain this page" — what each page is for, in plain words, with one
// practical tip. Answered instantly in the browser, like the instant
// answers. KEEP IN SYNC with supabase/functions/help-chat/grounding.ts,
// which is the source these were written from.
export const PAGE_GUIDE = {
  dashboard: `This is your **home base** — a quick look at how the business is doing.

- The chart compares money coming in (from paid invoices) with cash going out, over the last 6 months.
- Below it are your newest invoices and vouchers, and a short summary.

Tip: ask me "How did we do this month?" for a plain-language summary.`,

  clients: `This is your list of **clients** — the people and businesses you work with.

- Each has a name, TIN, address and contact details, and is marked as an individual or a company.
- You can link a client to a voucher to track who a transaction was with. This also matters for the SAWT report, which needs to know who withheld tax from you.
- Clients are also who you send invoices to in **Billing**.`,

  vouchers: `**Vouchers** are where you record every transaction — money in and money out.

- Each voucher has lines that debit and credit accounts, and total debits must equal total credits.
- A new voucher starts as a **Draft**, which doesn't count in any report. Post it with the checkmark once it's correct.
- Use **Bulk Import** to bring in many transactions from Excel. Imports always come in as drafts for you to check.
- A lock icon means the voucher is in a closed period.

Tip: ask me "How many drafts do we have?" to see what's still waiting.`,

  accounts: `Your **Chart of Accounts** is the list of every account the business uses — like Cash, Sales Revenue or Rent Expense.

- Each account has a type: Asset, Liability, Equity, Revenue or Expense. The type decides where it appears in your reports.
- Every voucher line uses one of these accounts, so it's worth setting this up first.
- If it's empty, the **Use Starter Chart of Accounts** button sets up a standard list.`,

  'trial-balance': `The **Trial Balance** lists every account with its total debits and credits, from posted vouchers only.

- Total debits and total credits should always be equal — that's what "the books tally" means.
- If they're not, a posted voucher doesn't balance somewhere.

Tip: say "check my books" and I'll look for the problem.`,

  'account-listing': `**Account Listing** shows every transaction for each account, one line at a time, with a running balance.

- It's the place to see exactly what made up an account's total.
- You can filter it and export it to Excel.

Tip: ask me "How much did we spend on travel this month?" to get a total without scrolling.`,

  'cash-flow': `**Cash Flow** shows money moving in and out of your cash and bank accounts.

- A chart covers the last 6 months, with a list of recent cash transactions below it.
- Only vouchers that touch a cash or bank account show up here.

Tip: ask me "How much cash do we have?" for today's total.`,

  'closing-books': `**Closing Books** formally closes an accounting period, like a month or a year.

- It zeroes out your Revenue and Expense accounts into an equity account you choose, like Retained Earnings, by posting a closing voucher.
- After that, every voucher in the period is **locked**, so nothing can be added, changed or deleted.
- Preview the closing entry first to see the net income or loss. The most recent closing can be reopened if something needs fixing.`,

  financial: `**Financial Reports** has your main statements, built from posted vouchers:

- **Balance Sheet** — what the business owns and owes, as of a date.
- **Income Statement** — what it earned and spent over a period, and the resulting net income or loss.
- **Key ratios** for a quick health check.

Drafts aren't included until they're posted. Tip: ask me "What's our profit this year?"`,

  'tax-report': `The **Tax Report** shows the transactions behind your tax computation, for your tax scheme (VAT or Percentage Tax, set in **Settings**).

- It's the supporting detail — which vouchers made up the taxable amounts.
- Only posted vouchers count.`,

  'tax-return': `**Tax Return** helps you prepare your quarterly return from your posted vouchers, based on your tax scheme in **Settings**.

- Pick the year and quarter to see gross sales and the tax due, then print or save it as a PDF.
- It's a summary to help you fill out the actual BIR form. For the compliance decisions themselves, check with your accountant.

Tip: ask me "When is the next tax deadline?"`,

  'ewt-report': `The **EWT Report** has two tabs, for tax withheld in two directions:

- **EWT (Payable)** — tax YOU withheld from the people you paid. You can generate a **BIR Form 2307** for a payee and quarter here.
- **SAWT (Receivable)** — tax your CLIENTS withheld from what they paid you. This builds the SAWT report BIR expects.

ATC codes aren't tracked in the ledger, so you type them in before generating.`,

  billing: `**Billing** is where you invoice your clients.

- Each invoice is Unpaid, Paid or Overdue.
- Marking one paid asks which cash or bank account received the money.

Tip: ask me "Any unpaid invoices?" — and I'll flag past-due ones in the chat.`,

  'raw-materials': `**Raw Materials** is your list of materials, plus every stock movement for each one.

- Current stock is always the opening stock plus every movement.
- **Intake** is added here, **Consumption** comes automatically from Production, and **Adjustments** correct mistakes (they need the deletion password).`,

  assembly: `**Product Assembly** has two tabs:

- **Products** — your finished goods, with their price and opening stock.
- **Recipes** — how much of each raw material it takes to make one unit of a product.

Production uses these recipes to use up raw materials automatically.`,

  production: `**Production** is where you log each batch you make.

- Pick a product and quantity, and the raw materials in its recipe are used up automatically.
- You'll get a warning if a batch would take a material below zero.
- Deleting a batch puts the materials back.`,

  sales: `**Sales** records your product sales as invoices, each with one or more products.

- Choose Cash or Credit. Each sale is posted to your books automatically.
- Note: a sale doesn't reduce product stock in this app.
- Editing or deleting a sale needs the deletion password.`,

  settings: `**Settings** holds everything about your company and how the app works:

- Company details, and your **tax scheme** (VAT or Percentage Tax).
- **Team Members**, so each person has their own access.
- **Appearance** — dark mode, text size, colors.
- The **Tutorial**, and the **Help Assistant** settings, including whether I can see your peso figures.
- **Data** — the deletion password, and other data tools.`,
}

export const EXPLAIN_PAGE = /explain (this|the) (page|screen)|what('s| is) this (page|screen|for)|what am i looking at|ano (ito|to)\b|para saan (ito|to)|i-?explain/i
