// Instant answers for the most common "how do I…" questions — answered
// right in the browser, without calling any AI provider. This saves free
// AI quota for the questions that actually need it, and these answers
// come back instantly, even offline.
//
// Matching is deliberately STRICT: every group in an entry must match
// (e.g. a word about posting AND a word about vouchers), because a
// confidently wrong instant answer is worse than a slightly slower AI
// one. Anything that looks like a question about the person's own numbers
// ("how much…", "magkano…", a voucher number) always skips this and goes
// to the AI, which can see the actual figures. And every instant answer
// has an "Ask the AI instead" button for when the match isn't right.
//
// KEEP IN SYNC with supabase/functions/help-chat/grounding.ts — the AI
// answers from that document, and the two must never contradict each
// other.

// Each group is a list of alternatives. Words of 4+ letters also match
// their longer forms ("post" matches "posting", "posted"); shorter words
// must match exactly. Multi-word phrases match as a phrase.
const FAQ = [
  {
    id: 'create-voucher',
    goto: 'vouchers',
    groups: [['new', 'create', 'add', 'record', 'make', 'enter', 'gawa', 'gumawa', 'mag-record', 'input'], ['voucher', 'transaction', 'journal entry', 'expense', 'sale']],
    exclude: ['bulk', 'import', 'excel', 'many', 'template'],
    answer: `Go to **Vouchers** and click **New Voucher**.

1. Pick the voucher type (for example, Cash Voucher for an expense, Sales Voucher for a sale).
2. Add the entries. Each line debits or credits one account, and total debits must equal total credits.
3. Save. It starts as a **Draft**, which doesn't count in any report yet.
4. When it's correct, **post** it with the checkmark icon so it counts in your reports.`,
  },
  {
    id: 'post-voucher',
    goto: 'vouchers',
    groups: [['post', 'i-post', 'finalize', 'finalise'], ['voucher', 'draft', 'entry', 'entries', 'transaction']],
    answer: `Find the voucher in **Vouchers** and click the **checkmark icon** on its row. The checkmark only shows on drafts.

You'll be asked to confirm, and if a deletion password is set in Settings, to enter it too. Once posted, the voucher counts in Trial Balance, Financial Reports, Tax Report, and the other reports. Drafts never do.`,
  },
  {
    id: 'edit-voucher',
    goto: 'vouchers',
    groups: [['edit', 'change', 'fix', 'correct', 'update', 'modify', 'palitan', 'baguhin', 'ayusin'], ['voucher', 'entry', 'entries', 'transaction']],
    answer: `In **Vouchers**, click the **pencil icon** on the voucher's row.

If you see a **lock icon** instead, the voucher is inside a closed accounting period. Go to **Closing Books**, reopen the most recent closing, make the change, then close the period again.`,
  },
  {
    id: 'delete-voucher',
    goto: 'vouchers',
    groups: [['delete', 'remove', 'erase', 'burahin', 'tanggalin'], ['voucher', 'entry', 'transaction']],
    exclude: ['all my data', 'everything', 'attachment', 'receipt', 'file'],
    answer: `In **Vouchers**, click the **trash icon** on the voucher's row. To confirm, type the exact voucher number, plus the deletion password if one is set in Settings. This is on purpose, so financial records aren't deleted by accident.

If you see a **lock icon** instead, the voucher is in a closed period. Reopen it in **Closing Books** first.`,
  },
  {
    id: 'attach-receipt',
    goto: 'vouchers',
    groups: [['attach', 'attachment', 'upload', 'ilagay'], ['receipt', 'photo', 'picture', 'file', 'document', 'scan', 'pdf', 'image', 'resibo', 'voucher']],
    exclude: ['bulk', 'import', 'excel', 'logo', 'report a', 'screenshot'],
    answer: `Open the voucher in **Vouchers** and use its **Attachments** section. You can attach PDFs or photos (JPG, PNG, WEBP), up to 10 MB each. Big phone photos are shrunk automatically when uploaded.

Two things to know:
- **Save a new voucher first**, then reopen it. Attachments only appear on a saved voucher.
- Attaching needs an **internet connection** at that moment, unlike the rest of the app.`,
  },
  {
    id: 'bulk-import',
    goto: 'vouchers',
    groups: [['bulk', 'import', 'mass upload', 'many vouchers', 'from excel', 'spreadsheet']],
    answer: `Go to **Vouchers** and click **Bulk Import**.

1. Pick the journal type and click **Download … Journal Template** to get the right Excel format.
2. Fill it in, one transaction per row, then upload it.
3. Review the preview, then confirm.

Good to know:
- All rows go into **one voucher**.
- If a row's debit or credit **account is blank**, that side is simply left out. No warning.
- An account name that doesn't match your Chart of Accounts, or amounts that don't add up, gets **flagged in red** so you can fix it.
- The import is always saved as a **Draft**, even when nothing is flagged. Check it in Vouchers, then post it with the checkmark. A voucher that doesn't balance can't be posted.
- Each line's description is the **payee**.`,
  },
  {
    id: 'add-account',
    goto: 'accounts',
    groups: [['add', 'create', 'new', 'gawa', 'gumawa', 'make'], ['account']],
    exclude: ['team', 'member', 'user', 'login', 'sign up', 'signup', 'staff', 'employee', 'email'],
    answer: `Go to **Chart of Accounts** and click **New Account**. Give it a name, code, and type: **Asset, Liability, Equity, Revenue,** or **Expense**. The type decides which reports and sections the account shows up in.

Starting from nothing? If your chart is empty, there's a **Use Starter Chart of Accounts** button that sets up a standard list for you.`,
  },
  {
    id: 'closing-books',
    goto: 'closing-books',
    groups: [['close', 'closing', 'year-end', 'year end', 'month-end', 'month end'], ['book', 'books', 'period', 'month', 'year', 'accounts']],
    exclude: ['reopen', 'open again', 'undo', 'unlock'],
    answer: `Go to **Closing Books** (under Accounting in the sidebar).

1. Pick the date to **close through**. It can't be in the future.
2. Pick the **equity account** that should receive the net result, like Retained Earnings or Owner's Capital.
3. Click **Preview Closing Entry** to see what gets zeroed out and the net income or loss.
4. Click **Close & Lock Period**.

This posts a closing voucher that zeroes out Revenue and Expense into equity, and **locks** every voucher in that period so it can't be added, edited, or deleted.`,
  },
  {
    id: 'reopen-period',
    goto: 'closing-books',
    groups: [['reopen', 're-open', 'open again', 'unlock', 'undo'], ['period', 'closing', 'books', 'month', 'year', 'locked', 'voucher']],
    answer: `Go to **Closing Books**, expand the closing under **Closing History**, and click **Reopen This Period**.

Only the **most recent** closing can be reopened, so reopen later ones first. Reopening deletes that period's closing voucher and makes its vouchers editable again. You can close it again afterward.`,
  },
  {
    id: 'team-members',
    goto: 'settings',
    groups: [['team', 'member', 'staff', 'employee', 'another person', 'other people', 'kasama', 'helper', 'assistant user'], ['add', 'invite', 'create', 'access', 'permission', 'restrict', 'allow', 'give', 'set up', 'setup']],
    answer: `Go to **Settings → Team Members**. Each person gets their own name and password, and can be marked **Admin** (everything) or given only certain tabs to **edit**. Other tabs stay visible but view-only.

Worth knowing: everyone still shares the same login underneath. This prevents accidental edits, but it isn't a hard security boundary.`,
  },
  {
    id: 'deletion-password',
    goto: 'settings',
    groups: [['password'], ['delete', 'deletion', 'deleting', 'posting', 'set', 'change']],
    exclude: ['login', 'log in', 'sign in', 'email', 'forgot', 'team', 'member'],
    answer: `The deletion password is in **Settings → Data**. When it's set, the app asks for it before deleting or posting a voucher, on top of the usual confirmation.`,
  },
  {
    id: 'appearance',
    goto: 'settings',
    groups: [['dark mode', 'light mode', 'dark', 'theme', 'accent', 'contrast', 'text size', 'font', 'bigger', 'larger', 'too small', 'hard to read', 'compact', 'density', 'comfortable', 'collapse sidebar', 'colors', 'colour', 'color']],
    exclude: ['logo', 'report', 'voucher', 'account', 'screenshot', 'file', 'photo', 'attachment', 'upload'],
    answer: `Go to **Settings → Appearance**. There you can switch **Light/Dark** (plus a True Black option), turn **High Contrast** on or off, choose **Density** (Compact, Standard, or Comfortable for bigger text and spacing), pick an **accent color**, and collapse the sidebar to icons.

These settings are saved per device, so each person can set things up their own way.`,
  },
  {
    id: 'tutorial',
    goto: 'settings',
    groups: [['tutorial', 'walkthrough', 'tour', 'onboarding', 'show me around']],
    answer: `Go to **Settings → Tutorial** and click **Open Tutorial**. You can pick any part, in any order, and the practice parts never touch your real data.`,
  },
  {
    id: 'report-problem',
    groups: [['report'], ['problem', 'bug', 'issue', 'error', 'broken', 'not working', 'mali', 'sira']],
    answer: `Two ways:
- Click the **flag button** in the bottom-right corner, next to this chat bubble.
- Or **highlight any text** on the page and click the **Report this** pill that appears.

A screenshot of the page is attached automatically. You can retake it, upload your own instead, or remove it before sending.`,
  },
  {
    id: 'install-app',
    goto: 'settings',
    groups: [['install', 'home screen', 'homescreen', 'desktop app', 'phone app', 'as an app']],
    answer: `Go to **Settings → Install App** and follow the steps for your device. Once installed, DBC Ledger opens like a normal app from your home screen or desktop.`,
  },
  {
    id: 'offline',
    groups: [['offline', 'no internet', 'without internet', 'walang internet', 'no signal', 'sync', 'syncing', 'pending']],
    answer: `The app works **offline**. Your changes are saved on the device and sync automatically once you're back online. The indicator at the top right shows how many changes are still waiting to sync.

The one exception is **attaching files** to a voucher, which needs a live connection at that moment.`,
  },
  {
    id: 'export-excel',
    groups: [['export', 'download', 'excel', 'xlsx', 'spreadsheet'], ['report', 'listing', 'cash flow', 'financial', 'tax report', 'vouchers', 'excel', 'data']],
    exclude: ['template', 'import', 'bulk'],
    answer: `Look for the **Export to Excel** button. It's on **Vouchers**, **Account Listing**, **Cash Flow**, **Financial Reports**, and **Tax Report**. The export uses whatever filters you have applied on that page.`,
  },
  {
    id: 'print-voucher',
    goto: 'vouchers',
    groups: [['print', 'printout', 'i-print'], ['voucher']],
    answer: `In **Vouchers**, click the **printer icon** on the voucher's row to get a printable copy.`,
  },
]

// Questions about the person's own figures, a specific record, or "why"
// something looks wrong need the AI (which can see the data and reason
// about it), never a canned answer.
const DATA_INTENT = [
  'how much', 'how many', 'magkano', 'ilan', 'total', 'balance', 'my revenue', 'my income',
  'my expense', 'my sales', 'net income', 'profit', 'kita', 'loss', 'why', 'bakit', 'which voucher',
  'show me my', 'list my', 'what is my', "what's my", 'whats my', 'owe', 'unpaid', 'overdue',
]
const RECORD_REFERENCE = /\b(gj|sv|rj|dj|cv|jv)\s?\d{4}-\d+|\d{2,}/i

function normalize(text) {
  return ' ' + text.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim() + ' '
}

function hasTerm(norm, words, term) {
  if (term.includes(' ')) return norm.includes(' ' + term + ' ') || norm.includes(' ' + term)
  if (term.length >= 4) return words.some(w => w.startsWith(term))
  return words.includes(term)
}

// Returns the matching FAQ entry, or null if this question should go to
// the AI instead.
export function findInstantAnswer(question) {
  if (!question || question.length > 160) return null // long questions are nuanced; let the AI read them
  const norm = normalize(question)
  const words = norm.trim().split(' ')
  if (DATA_INTENT.some(t => hasTerm(norm, words, t))) return null
  if (RECORD_REFERENCE.test(question)) return null

  let best = null
  for (const entry of FAQ) {
    if (entry.exclude && entry.exclude.some(t => hasTerm(norm, words, t))) continue
    if (!entry.groups.every(group => group.some(t => hasTerm(norm, words, t)))) continue
    if (!best || entry.groups.length > best.groups.length) best = entry
  }
  return best ? { id: best.id, answer: best.answer, goto: best.goto || null } : null
}
