import { useState, useRef, useEffect } from 'react'
import { MessageCircleQuestion, X, Send, Loader2 } from 'lucide-react'
import { supabase, supabaseUrl } from '../lib/supabase'
import { useStore } from '../store/useStore.jsx'
import { buildDataSummary } from '../utils'
import { showToast } from '../lib/toast'

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
  { id: 'financial', label: 'Financial Reports' },
  { id: 'tax-report', label: 'Tax Report' },
  { id: 'tax-return', label: 'Tax Return' },
  { id: 'ewt-report', label: 'EWT Report' },
  { id: 'billing', label: 'Billing' },
  { id: 'settings', label: 'Settings' },
]

// `page` and `activeMember` are passed down from AppShell, which already
// tracks both (current nav page, and the Team Member identification gate)
// — this widget doesn't need its own copy of that logic.
export default function HelpChatWidget({ page, activeMember }) {
  const { vouchers, clients, bills, accounts, settings } = useStore()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([]) // [{ role: 'user'|'model', text }]
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open])

  async function send() {
    const text = input.trim()
    if (!text || streaming) return

    const nextMessages = [...messages, { role: 'user', text }]
    // Placeholder goes in immediately, before anything async — this is what
    // makes ThinkingDots show up. It used to get added only after the
    // fetch resolved, which meant total silence (no dots, no feedback at
    // all) during the session lookup + data summary build + network round
    // trip, and if the request errored before a response body ever came
    // back, the placeholder never appeared at all — from the outside that
    // looks exactly like "nothing happened."
    setMessages([...nextMessages, { role: 'model', text: '' }])
    setInput('')
    setStreaming(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        showToast('You need to be signed in to use Help Chat.', 'error')
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
        body: JSON.stringify({ messages: nextMessages, dataSummaryText }),
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
      let userMessage = 'Help Chat had a problem answering that — try again in a moment.'
      const raw = String(err.message || err)
      if (raw.includes('QUOTA_EXCEEDED')) {
        userMessage = 'Help Chat has hit today\'s usage limit and needs an admin to check the AI provider settings — try again later, or ask an admin to look into it.'
      } else if (raw.includes('MODEL_OVERLOADED')) {
        userMessage = 'Help Chat\'s AI provider is temporarily overloaded — try again in a minute or two.'
      }
      showToast(userMessage, 'error', 7000) // longer than the default 4s — an error worth actually seeing
      setMessages(nextMessages) // drop the empty placeholder, back to before this question was asked
      console.error('help chat error:', err)
    } finally {
      setStreaming(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Help"
        className="help-chat-fab"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 1000,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: 'var(--accent)', color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}
      >
        {open ? <X size={22} /> : <MessageCircleQuestion size={24} />}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 84, right: 20, zIndex: 1000,
          width: 340, maxWidth: 'calc(100vw - 40px)', height: 460, maxHeight: 'calc(100vh - 120px)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'fade-scale 0.18s cubic-bezier(0.4,0,0.2,1)', transformOrigin: 'bottom right',
        }}>
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid var(--border)',
            fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
          }}>
            Help
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
                Ask me anything about using this app — where to find something, how a workflow
                works, or what a report shows. I can't give tax or legal advice, and I'll say so
                if that's what's being asked.
              </div>
            )}
            {messages.map((m, i) => {
              const isLastAndEmpty = streaming && i === messages.length - 1 && m.role === 'model' && !m.text
              return (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-1)',
                  borderRadius: 10, padding: '8px 11px', fontSize: 12.5, lineHeight: 1.5,
                  whiteSpace: m.role === 'user' ? 'pre-wrap' : undefined,
                  animation: 'message-in 0.2s ease',
                }}>
                  {isLastAndEmpty ? <ThinkingDots /> : (m.role === 'model' ? renderMarkdownLite(m.text) : m.text)}
                </div>
              )
            })}
          </div>

          <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            <input
              className="form-input"
              style={{ flex: 1, fontSize: 12.5 }}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask a question…"
              disabled={streaming}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={send}
              disabled={streaming || !input.trim()}
              style={{ padding: '0 12px' }}
            >
              {streaming ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
