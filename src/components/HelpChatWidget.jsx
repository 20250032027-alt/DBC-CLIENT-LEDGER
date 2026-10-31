import { useState, useRef, useEffect, useMemo } from 'react'
import { X, Send, Loader2, Flag, Zap, Sparkles, ArrowRight, RotateCcw, CheckCircle2, AlertCircle, CalendarClock } from 'lucide-react'
import { supabase, supabaseUrl } from '../lib/supabase'
import { useStore } from '../store/useStore.jsx'
import { buildDataSummary } from '../utils'
import { showToast } from '../lib/toast'
import { captureScreenshot } from '../lib/screenshot'
import ReportModal from './ReportModal.jsx'
import { findInstantAnswer } from '../lib/helpFaq'
import Tally from './Tally.jsx'
import { answerNumbers } from '../lib/tallyNumbers'
import { checkBooks } from '../lib/tallyHealth'
import { PAGE_GUIDE, EXPLAIN_PAGE } from '../lib/pageGuide'
import { upcomingDeadlines, DEADLINE_QUESTION, DEADLINE_CAVEAT } from '../lib/taxDeadlines'

// ── Minimal markdown rendering — no new dependency ──
// The model's answers use a small, predictable set of formatting: **bold**,
// bullet lists, occasionally numbered steps. A full markdown library is
// overkill for that; this handles exactly what actually shows up so
// "**bold**" renders as bold instead of literal asterisks.
function renderInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-b${i}`}>{part.slice(2, -2)}</strong>
    }
    return <span key={`${keyPrefix}-t${i}`}>{part}</span>
  })
}

function renderMarkdownLite(text) {
  const lines = text.split('\n')
  const blocks = []
  let list = null
  let listType = null // 'ul' | 'ol'

  function flushList() {
    if (list) {
      const Tag = listType
      blocks.push(<Tag key={`list-${blocks.length}`} style={{ margin: '2px 0 6px', paddingLeft: 18 }}>{list}</Tag>)
      list = null
      listType = null
    }
  }

  lines.forEach((line, i) => {
    const heading = line.match(/^\s*(#{1,4})\s+(.*)/)
    const bullet = line.match(/^\s*[-*]\s+(.*)/)
    const numbered = line.match(/^\s*\d+\.\s+(.*)/)
    if (heading) {
      flushList()
      const level = heading[1].length
      blocks.push(
        <div key={i} style={{
          fontWeight: 700,
          fontSize: level <= 2 ? 13.5 : 12.5,
          marginTop: blocks.length ? 8 : 0,
          marginBottom: 3,
        }}>
          {renderInline(heading[2], i)}
        </div>
      )
    } else if (bullet) {
      if (listType !== 'ul') flushList()
      listType = 'ul'
      list = list || []
      list.push(<li key={i} style={{ marginBottom: 3 }}>{renderInline(bullet[1], i)}</li>)
    } else if (numbered) {
      if (listType !== 'ol') flushList()
      listType = 'ol'
      list = list || []
      list.push(<li key={i} style={{ marginBottom: 3 }}>{renderInline(numbered[1], i)}</li>)
    } else {
      flushList()
      if (line.trim() === '') {
        blocks.push(<div key={`sp-${i}`} style={{ height: 6 }} />)
      } else {
        blocks.push(<div key={i} style={{ marginBottom: 2 }}>{renderInline(line, i)}</div>)
      }
    }
  })
  flushList()
  return blocks
}

function ThinkingDots() {
  return (
    <span className="help-chat-dots">
      <span /><span /><span />
    </span>
  )
}

// Mirrors TEAM_PAGES in Settings.jsx — needed here too so the data summary
// can list which tabs the active Team Member can edit by their display
// label, not just their internal page id. Kept as a separate constant
// (rather than importing across page files) to avoid coupling this widget
// to Settings.jsx's internals; keep in sync if pages are ever added.
const TEAM_PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'clients', label: 'Clients' },
  { id: 'vouchers', label: 'Vouchers' },
  { id: 'accounts', label: 'Chart of Accounts' },
  { id: 'trial-balance', label: 'Trial Balance' },
  { id: 'account-listing', label: 'Account Listing' },
  { id: 'cash-flow', label: 'Cash Flow' },
  { id: 'closing-books', label: 'Closing Books' },
  { id: 'financial', label: 'Financial Reports' },
  { id: 'tax-report', label: 'Tax Report' },
  { id: 'tax-return', label: 'Tax Return' },
  { id: 'ewt-report', label: 'EWT Report' },
  { id: 'billing', label: 'Billing' },
  { id: 'raw-materials', label: 'Raw Materials' },
  { id: 'assembly', label: 'Product Assembly' },
  { id: 'production', label: 'Production' },
  { id: 'sales', label: 'Sales' },
  { id: 'settings', label: 'Settings' },
]

const PAGE_LABEL = Object.fromEntries(TEAM_PAGES.map(p => [p.id, p.label]))

// Starter questions for whichever page the person is on, so nobody faces
// an empty box. Mostly ones the instant answers cover — free and immediate.
// Money questions are answered by Tally's numbers engine — calculated
// from the books, free and instant. They're hidden when peso figures are
// turned off for the assistant (Settings → Help Assistant).
const SUGGESTIONS = {
  dashboard: ['How did we do this month?', 'How much cash do we have?', 'How do I record a transaction?'],
  vouchers: ['How do I post a voucher?', 'How many drafts do we have?', 'How does bulk import work?'],
  accounts: ['How do I add a new account?', 'Biggest expenses this month?'],
  financial: ['How did we do this month?', "What's our profit this year?", 'Biggest expenses this month?'],
  'account-listing': ['Biggest expenses this month?', 'How do I export to Excel?'],
  billing: ['Any unpaid invoices?', 'How much cash do we have?'],
  'closing-books': ['How do I close the books?', 'How do I reopen a closed period?'],
  'tax-return': ['When is the next tax deadline?'],
  'tax-report': ['When is the next tax deadline?'],
  'ewt-report': ['When is the next tax deadline?'],
  settings: ['How do I add a team member?', 'How do I turn on dark mode?', 'Where is the tutorial?'],
}
const DEFAULT_SUGGESTIONS = ['How did we do this month?', 'How do I record a transaction?', 'Paano mag post ng voucher?']
const MONEY_CHIPS = new Set(['How did we do this month?', 'How much cash do we have?', 'Biggest expenses this month?', "What's our profit this year?", 'Any unpaid invoices?'])
const BOOKS_CHECK = /check (my |our |the )?books|health ?check|anything wrong|any problems|may mali|i-?check/i

// Pages mentioned in an answer (as **Page Name**) become "Go to" buttons,
// so a person can jump straight there instead of hunting in the sidebar.
function pageLinks(text, currentPage) {
  const found = []
  for (const m of (text || '').matchAll(/\*\*([^*]+)\*\*/g)) {
    const name = m[1].split('→')[0].trim().toLowerCase()
    const hit = TEAM_PAGES.find(p => p.label.toLowerCase() === name)
    if (hit && hit.id !== currentPage && !found.includes(hit.id)) found.push(hit.id)
  }
  return found.slice(0, 2)
}

const STORAGE_PREFIX = 'dbc-tally-chat:'
function loadSaved(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]').filter(m => m && m.text) } catch { return [] }
}

// `page` and `activeMember` are passed down from AppShell, which already
// tracks both (current nav page, and the Team Member identification gate)
// — this widget doesn't need its own copy of that logic.
export default function HelpChatWidget({ page, activeMember, onNavigate }) {
  const { userId, vouchers, clients, bills, accounts, settings, periodClosings } = useStore()
  const books = { vouchers, accounts, bills, settings, periodClosings }
  // The quick check of the books, recomputed whenever the books change.
  const health = useMemo(() => checkBooks({ vouchers, accounts, bills, periodClosings }), [vouchers, accounts, bills, periodClosings])
  const moneyOn = settings?.helpAssistantDataEnabled !== false
  // Upcoming BIR due dates for the returns this app prepares (counts no money,
  // so shown even when peso figures are turned off).
  const deadlines = useMemo(() => upcomingDeadlines({ settings, vouchers }), [settings, vouchers])
  const soon = deadlines.filter(d => d.daysLeft <= 30).slice(0, 3)
  const urgent = deadlines.some(d => d.daysLeft <= 7)
  const [open, setOpen] = useState(false)
  // The conversation is kept on this device per account (and per Team
  // Member), so closing the chat or reloading the page doesn't lose it.
  const storageKey = STORAGE_PREFIX + (userId || 'anon') + (activeMember ? ':' + activeMember.id : '')
  const [messages, setMessages] = useState(() => loadSaved(storageKey)) // [{ role: 'user'|'model'|'error', text, detail?, instant?, goto? }]
  const [online, setOnline] = useState(() => navigator.onLine)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [reportState, setReportState] = useState(null) // null | 'capturing' | 'hidden' | 'open'
  const [reportPrefill, setReportPrefill] = useState('')
  const [reportScreenshot, setReportScreenshot] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    // Jump to the newest message — but the welcome screen starts at the top,
    // so Tally's greeting isn't scrolled out of view.
    if (scrollRef.current) scrollRef.current.scrollTop = messages.length ? scrollRef.current.scrollHeight : 0
  }, [messages, open])

  // Switching account / Team Member loads that person's own conversation.
  useEffect(() => { setMessages(loadSaved(storageKey)) }, [storageKey])
  useEffect(() => {
    if (streaming) return // don't save half-written answers
    try { localStorage.setItem(storageKey, JSON.stringify(messages.filter(m => m.text).slice(-40))) } catch { /* storage full or blocked */ }
  }, [messages, streaming, storageKey])
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  // Tally's face follows what's happening in the conversation.
  const last = messages[messages.length - 1]
  const mood = !online ? 'sleepy' : streaming ? 'thinking' : last?.role === 'error' ? 'concerned' : 'idle'
  const status = !online ? 'Offline — instant answers still work' : streaming ? 'Counting…' : 'Your ledger buddy'

  function goTo(pageId) {
    onNavigate?.(pageId)
    if (window.matchMedia('(max-width: 600px)').matches) setOpen(false) // full-screen on phones: get out of the way
  }

  function newChat() {
    if (streaming) return
    setMessages([])
  }

  async function send(override) {
    const text = (typeof override === 'string' ? override : input).trim()
    if (!text || streaming) return
    setInput('')
    const withQuestion = [...messages, { role: 'user', text }]

    // "Explain this page" — about whichever page they're on right now.
    if (EXPLAIN_PAGE.test(text) && PAGE_GUIDE[page]) {
      setMessages([...withQuestion, { role: 'model', text: PAGE_GUIDE[page], instant: true }])
      return
    }

    // Common "how do I…" questions are answered instantly, right here,
    // without spending any free AI quota. Anything about the person's own
    // numbers is never answered this way (see helpFaq.js).
    const instant = findInstantAnswer(text)
    if (instant) {
      setMessages([...withQuestion, { role: 'model', text: instant.answer, instant: true, goto: instant.goto || null }])
      return
    }
    if (DEADLINE_QUESTION.test(text)) {
      const next = upcomingDeadlines({ settings, vouchers }, new Date(), 90)
      const lines = next.map(d => `- **${d.form}** ${d.title}, ${d.period}: due **${d.dueLabel}** (${d.whenText})`
        + (d.movedLabel ? ` — falls on a weekend, so BIR moves it to ${d.movedLabel}` : '') + (d.note ? `. ${d.note}` : ''))
      setMessages([...withQuestion, { role: 'model', instant: true, goto: next[0]?.goto || null,
        text: (next.length ? `Here's what's coming up in the next 90 days:\n\n${lines.join('\n')}` : 'No filing deadlines in the next 90 days for the returns I keep track of.')
          + `\n\n${DEADLINE_CAVEAT}` }])
      return
    }
    // Money questions are CALCULATED from the books with the same functions
    // as the reports — the AI never invents a figure. Free, instant, offline.
    const computed = answerNumbers(text, books)
    if (computed) {
      setMessages([...withQuestion, { role: 'model', text: computed.text, computed: true, goto: computed.goto || null }])
      return
    }
    if (BOOKS_CHECK.test(text)) {
      setMessages([...withQuestion, { role: 'model', computed: true, check: health.items,
        text: !health.items.length ? "Nothing to check yet — post your first voucher and I'll keep an eye on things."
          : health.issues ? `I found **${health.issues} thing${health.issues !== 1 ? 's' : ''}** worth a look:` : "Your books look good! Here's what I checked:" }])
      return
    }
    if (!online) {
      setMessages([...withQuestion, { role: 'model', text: "I can't reach my AI brain while you're offline, so I can only answer common how-to questions right now. Ask me again once you're back online!" }])
      return
    }
    await askAI(withQuestion)
  }

  // "Not what you meant? Ask the AI" — drops the instant answer and sends
  // the same question to the AI instead.
  function askAIInstead(instantIndex) {
    if (streaming) return
    askAI(messages.slice(0, instantIndex))
  }

  async function askAI(nextMessages) {
    // Placeholder goes in immediately, before anything async — this is what
    // makes ThinkingDots show up. It used to get added only after the
    // fetch resolved, which meant total silence (no dots, no feedback at
    // all) during the session lookup + data summary build + network round
    // trip, and if the request errored before a response body ever came
    // back, the placeholder never appeared at all — from the outside that
    // looks exactly like "nothing happened."
    setMessages([...nextMessages, { role: 'model', text: '' }])
    setStreaming(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        showToast('Please sign in first, then I can help.', 'error')
        setMessages(nextMessages) // drop the placeholder, nothing is happening
        setStreaming(false)
        return
      }

      const dataSummaryText = buildDataSummary({
        vouchers, clients, bills, accounts, settings, activeMember, teamPages: TEAM_PAGES, page,
      })

      const res = await fetch(`${supabaseUrl}/functions/v1/help-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        // Only real conversation turns go to the AI. Error notices are a
        // UI-only part of this chat, and an unknown "error" role makes AI
        // providers reject the whole request — so one error used to break
        // every later question in the same chat.
        body: JSON.stringify({
          messages: nextMessages.filter(m => (m.role === 'user' || m.role === 'model') && m.text),
          dataSummaryText,
        }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(errBody || `Request failed (${res.status})`)
      }

      // Stream the response in as it arrives, appending to the placeholder
      // already sitting at the end of the message list.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setMessages(m => {
          const copy = [...m]
          copy[copy.length - 1] = { role: 'model', text: full }
          return copy
        })
      }
    } catch (err) {
      let userMessage = 'Sorry, I couldn\'t answer that just now. Please try again in a moment.'
      const raw = String(err.message || err)
      if (raw.includes('QUOTA_EXCEEDED')) {
        userMessage = 'I\'ve used up today\'s free AI answers, so I can only do quick how-to answers until tomorrow. If this keeps happening, ask your admin to check the AI settings.'
      } else if (raw.includes('MODEL_OVERLOADED')) {
        userMessage = 'The AI service I use is busy right now. Please try again in a minute or two.'
      }
      showToast(userMessage, 'error', 7000) // longer than the default 4s — an error worth actually seeing
      // Also left in the chat itself, not just a toast that disappears in
      // a few seconds — this is what makes "report this" possible after
      // the fact, and gives something to point at if someone asks the
      // admin about it later.
      setMessages(m => [...m.filter(msg => msg.text !== '' || msg.role !== 'model'), { role: 'error', text: userMessage, detail: raw }])
      console.error('help chat error:', err)
    } finally {
      setStreaming(false)
    }
  }

  async function handleReportError(detail) {
    setReportState('capturing')
    setReportPrefill(`The chat assistant showed this error:\n\n${detail}\n\n`)
    try {
      const shot = await captureScreenshot()
      setReportScreenshot(shot)
    } catch (e) {
      console.error('screenshot capture failed:', e)
    } finally {
      setReportState('open')
    }
  }

  const checkList = items => items.map((it, k) => (
    <div key={k} className="tally-check-item">
      {it.level === 'ok'
        ? <CheckCircle2 size={14} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
        : <AlertCircle size={14} color="var(--amber)" style={{ flexShrink: 0, marginTop: 1 }} />}
      <span style={{ flex: 1 }}>{it.text}</span>
      {it.level === 'warn' && it.goto && it.goto !== page && (
        <button className="tally-goto" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => goTo(it.goto)}>
          Fix <ArrowRight size={11} />
        </button>
      )}
    </div>
  ))

  const deadlineCard = soon.length > 0 && (

                  <div className="tally-check">
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>Tax deadlines coming up</div>
                    {soon.map(d => (
                      <div key={d.form + d.due} className="tally-check-item">
                        <CalendarClock size={14} color={d.daysLeft <= 7 ? 'var(--amber)' : 'var(--text-3)'} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ flex: 1 }}>
                          <b style={{ color: 'var(--text-1)' }}>{d.form}</b> for {d.period.split(' (')[0]} — due {d.dueLabel} ({d.whenText})
                          {d.movedLabel && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>Falls on a weekend; BIR moves it to {d.movedLabel}</span>}
                        </span>
                        {d.goto !== page && <button className="tally-goto" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => goTo(d.goto)}>Open <ArrowRight size={11} /></button>}
                      </div>
                    ))}
                  </div>
  )

  const suggestions = [...(PAGE_GUIDE[page] ? ['Explain this page'] : []), ...(SUGGESTIONS[page] || DEFAULT_SUGGESTIONS)]
    .filter(q => moneyOn || !MONEY_CHIPS.has(q)).slice(0, 4)
  const welcomeMood = !online ? 'sleepy' : health.issues ? 'concerned' : health.items.length ? 'happy' : 'idle'

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Close Tally' : 'Ask Tally'}
        aria-label={open ? 'Close Tally' : 'Ask Tally, your ledger assistant'}
        className={`help-chat-fab ${open ? 'is-open' : ''}`}
        data-tutorial="help-chat-fab"
      >
        {open ? <X size={22} /> : <Tally mood={mood === 'thinking' ? 'thinking' : 'idle'} size={30} />}
        {!open && (health.issues > 0 || urgent) && <span className="tally-fab-dot" aria-label="Something needs a look — open Tally" />}
      </button>

      {open && (
        <div className="tally-panel" role="dialog" aria-label="Tally, your ledger assistant">
          <div className="tally-header">
            <Tally mood={mood} size={30} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2 }}>Tally</div>
              <div style={{ fontSize: 11.5, color: streaming ? 'var(--accent)' : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className={`tally-status ${online ? 'on' : 'off'}`} />{status}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              {messages.length > 0 && (
                <button className="icon-btn" onClick={newChat} disabled={streaming} title="New chat" aria-label="Start a new chat"><RotateCcw size={15} /></button>
              )}
              <button className="icon-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close"><X size={17} /></button>
            </div>
          </div>

          <div ref={scrollRef} className="tally-body">
            {messages.length === 0 && (
              <div className="tally-welcome">
                <Tally mood={welcomeMood} size={92} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginTop: 6 }}>Hi, I'm Tally!</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, maxWidth: 270 }}>
                  I know this app inside out. Ask me how to do something, or about your own numbers. Let's make it tally.
                </div>
                {urgent && deadlineCard /* a deadline within a week comes first */}
                {health.items.length > 0 && (
                  <div className="tally-check">
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
                      {health.issues ? 'Quick check: a few things need a look' : 'Quick check: your books look good'}
                    </div>
                    {checkList(health.items)}
                  </div>
                )}
                {!urgent && deadlineCard}
                <div style={{ fontSize: 11, color: 'var(--text-3)', margin: '12px 0 2px', fontWeight: 600, letterSpacing: 0.3 }}>
                  {PAGE_LABEL[page] ? `ON ${PAGE_LABEL[page].toUpperCase()} — TRY` : 'TRY ASKING'}
                </div>
                <div className="tally-chips">
                  {suggestions.map(q => (
                    <button key={q} className="tally-chip" onClick={() => send(q)}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const isLastAndEmpty = streaming && i === messages.length - 1 && m.role === 'model' && !m.text
              // Tally's face appears once at the start of each run of its replies, not on every bubble.
              const firstOfRun = m.role !== 'user' && (i === 0 || messages[i - 1].role === 'user')
              const avatarSlot = (
                <div style={{ width: 26, flexShrink: 0, paddingTop: 2 }}>
                  {firstOfRun && <Tally mood={m.role === 'error' ? 'concerned' : isLastAndEmpty ? 'thinking' : 'idle'} size={22} />}
                </div>
              )
              if (m.role === 'error') {
                return (
                  <div key={i} className="tally-row">
                    {avatarSlot}
                    <div className="tally-bubble tally-bubble-error">
                      <div>{m.text}</div>
                      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', fontSize: 11.5, padding: '3px 9px', marginTop: 6 }} onClick={() => handleReportError(m.detail)}>
                        <Flag size={12} /> Report this
                      </button>
                    </div>
                  </div>
                )
              }
              if (m.role === 'user') {
                return <div key={i} className="tally-bubble-user">{m.text}</div>
              }
              const links = m.goto ? (m.goto === page ? [] : [m.goto]) : (isLastAndEmpty ? [] : pageLinks(m.text, page))
              return (
                <div key={i} className="tally-row">
                  {avatarSlot}
                  <div className="tally-bubble">
                    {isLastAndEmpty ? <ThinkingDots /> : renderMarkdownLite(m.text)}
                    {m.check?.length > 0 && <div style={{ marginTop: 8 }}>{checkList(m.check)}</div>}
                    {links.length > 0 && !streaming && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                        {links.map(id => (
                          <button key={id} className="tally-goto" onClick={() => goTo(id)}>
                            Go to {PAGE_LABEL[id]} <ArrowRight size={12} />
                          </button>
                        ))}
                      </div>
                    )}
                    {(m.instant || m.computed) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                        {m.computed
                          ? <span className="tally-calc"><CheckCircle2 size={11} /> Calculated from your books</span>
                          : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}><Zap size={11} /> Instant answer</span>}
                        {i === messages.length - 1 && (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11.5, padding: '3px 9px', marginLeft: 'auto' }} onClick={() => askAIInstead(i)} disabled={streaming}>
                            <Sparkles size={12} /> Not what you meant? Ask the AI
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="tally-input">
            <input
              className="form-input"
              style={{ flex: 1, fontSize: 13 }}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={online ? 'Ask Tally anything…' : "Offline — I can still answer how-to questions"}
              disabled={streaming}
              aria-label="Message Tally"
            />
            <button className="btn btn-primary btn-sm" onClick={() => send()} disabled={streaming || !input.trim()} style={{ padding: '0 13px' }} aria-label="Send">
              {streaming ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      )}

      {reportState === 'open' && (
        <ReportModal
          page={page}
          initialDescription={reportPrefill}
          initialCategory="bug"
          initialScreenshot={reportScreenshot}
          onClose={() => setReportState(null)}
          onSubmitted={() => {}}
        />
      )}
    </>
  )
}
