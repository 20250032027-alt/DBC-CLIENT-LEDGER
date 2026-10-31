import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, Flag, Zap, Sparkles, ArrowRight, RotateCcw } from 'lucide-react'
import { supabase, supabaseUrl } from '../lib/supabase'
import { useStore } from '../store/useStore.jsx'
import { buildDataSummary } from '../utils'
import { showToast } from '../lib/toast'
import { captureScreenshot } from '../lib/screenshot'
import ReportModal from './ReportModal.jsx'
import { findInstantAnswer } from '../lib/helpFaq'
import Tally from './Tally.jsx'

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
const SUGGESTIONS = {
  dashboard: ['How do I record a transaction?', 'How do I close the books?', 'Does it work offline?'],
  vouchers: ['How do I post a voucher?', 'How does bulk import work?', 'How do I attach a receipt?'],
  accounts: ['How do I add a new account?', 'How do I export to Excel?'],
  'closing-books': ['How do I close the books?', 'How do I reopen a closed period?'],
  settings: ['How do I add a team member?', 'How do I turn on dark mode?', 'Where is the tutorial?'],
}
const DEFAULT_SUGGESTIONS = ['How do I record a transaction?', 'How does bulk import work?', 'Paano mag post ng voucher?']

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
  const { userId, vouchers, clients, bills, accounts, settings } = useStore()
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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
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

    // Common "how do I…" questions are answered instantly, right here,
    // without spending any free AI quota. Anything about the person's own
    // numbers is never answered this way (see helpFaq.js).
    const instant = findInstantAnswer(text)
    if (instant) {
      setMessages([...withQuestion, { role: 'model', text: instant.answer, instant: true, goto: instant.goto || null }])
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

  const suggestions = SUGGESTIONS[page] || DEFAULT_SUGGESTIONS

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
                <Tally mood={online ? 'idle' : 'sleepy'} size={92} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginTop: 6 }}>Hi, I'm Tally!</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, maxWidth: 270 }}>
                  I know this app inside out. Ask me how to do something, or about your own numbers. Let's make it tally.
                </div>
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
                    {links.length > 0 && !streaming && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                        {links.map(id => (
                          <button key={id} className="tally-goto" onClick={() => goTo(id)}>
                            Go to {PAGE_LABEL[id]} <ArrowRight size={12} />
                          </button>
                        ))}
                      </div>
                    )}
                    {m.instant && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
                          <Zap size={11} /> Instant answer
                        </span>
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
