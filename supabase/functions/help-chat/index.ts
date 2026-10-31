// DBC Ledger — Help Assistant Edge Function
// -------------------------------------------------------------------------
// Sits between the chat widget in the app and the AI providers (Gemini,
// with Groq as a free backup). This is the ONLY place the real API keys
// ever exist — they're read from Edge Function secrets, never sent to the
// browser. See README.md in this folder
// for deployment steps.
//
// By default, Supabase Edge Functions require a valid Supabase auth JWT to
// call them at all (unless deployed with --no-verify-jwt, which we are NOT
// doing) — so only people actually logged into the app can reach this at
// all. That's the first line of defense against random internet traffic
// burning through the free AI quotas.

import { GROUNDING_DOC } from './grounding.ts'

// ── Provider chain ──
// The assistant tries each provider in order and moves to the next one if
// a provider fails BEFORE it starts answering — out of free quota (429),
// overloaded (503), model retired (404), or simply unreachable. This is
// what keeps the assistant free: stacking several free tiers multiplies
// how many questions a day it can handle, and nobody sees "quota
// exceeded" unless every provider in the chain is used up.
//
// Everything is configured with Edge Function secrets, not code, because
// providers rename and retire models constantly:
//   GEMINI_API_KEY  — Google AI Studio key (optional if Groq is set)
//   GEMINI_MODEL    — one model, or several comma-separated, tried in order
//                     e.g. "gemini-3.5-flash,gemini-3.1-flash-lite"
//   GROQ_API_KEY    — GroqCloud key (optional, but it's the free backup)
//   GROQ_MODEL      — defaults to openai/gpt-oss-120b, one of Groq's
//                     public production models (its Llama models became
//                     enterprise-only)
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODELS = (Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash')
  .split(',').map(m => m.trim()).filter(Boolean)
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b'
// Overridable only so the fallback logic can be tested against fake
// providers — leave unset in production.
const GEMINI_BASE = Deno.env.get('GEMINI_BASE_URL') || 'https://generativelanguage.googleapis.com'
const GROQ_BASE = Deno.env.get('GROQ_BASE_URL') || 'https://api.groq.com'

const MAX_OUTPUT_TOKENS = 4096

type ChatMessage = { role: 'user' | 'model'; text: string }
type ChunkParser = (json: any) => { text?: string; truncated?: boolean }
type Provider = { name: string; request: () => Promise<Response>; parse: ChunkParser }

function geminiProvider(model: string, history: ChatMessage[], system: string): Provider {
  return {
    name: `gemini:${model}`,
    request: () => fetch(`${GEMINI_BASE}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: {
          temperature: 0.3, // low — answer reliably from the doc, don't improvise
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // Some Gemini tiers count invisible "thinking" tokens against
          // maxOutputTokens, which can eat the budget before the visible
          // answer starts. Skip thinking for this fast, scoped Q&A.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }),
    parse: json => ({
      text: json?.candidates?.[0]?.content?.parts?.[0]?.text,
      truncated: json?.candidates?.[0]?.finishReason === 'MAX_TOKENS',
    }),
  }
}

function groqProvider(history: ChatMessage[], system: string): Provider {
  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    // Groq speaks the OpenAI format: "assistant" instead of Gemini's "model"
    messages: [
      { role: 'system', content: system },
      ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
    ],
    temperature: 0.3,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    stream: true,
  }
  // GPT-OSS is a reasoning model — its hidden reasoning counts against the
  // token budget, so keep it brief for quick help answers. Only sent to
  // reasoning models; other models would reject the field.
  if (/gpt-oss/.test(GROQ_MODEL)) body.reasoning_effort = 'low'
  return {
    name: `groq:${GROQ_MODEL}`,
    request: () => fetch(`${GROQ_BASE}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify(body),
    }),
    // Only the visible answer (delta.content) is forwarded — a reasoning
    // model's hidden reasoning arrives in a separate field and is dropped.
    parse: json => ({
      text: json?.choices?.[0]?.delta?.content,
      truncated: json?.choices?.[0]?.finish_reason === 'length',
    }),
  }
}

// Re-emits any provider's SSE stream as plain incremental text, so the
// chat widget never needs to know which provider actually answered.
function toPlainTextStream(resp: Response, parse: ChunkParser): ReadableStream {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const reader = resp.body!.getReader()
  return new ReadableStream({
    async start(controller) {
      let buffer = ''
      let truncated = false
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const jsonStr = line.slice(5).trim()
            if (!jsonStr || jsonStr === '[DONE]') continue
            try {
              const out = parse(JSON.parse(jsonStr))
              if (out.text) controller.enqueue(encoder.encode(out.text))
              if (out.truncated) truncated = true
            } catch {
              // A partial JSON fragment split across chunks — the next
              // chunk usually completes it.
            }
          }
        }
      } catch {
        // The connection dropped mid-answer. Too late to switch providers
        // (part of the answer is already on screen), so say so plainly.
        controller.enqueue(encoder.encode('\n\n_[The connection dropped before the answer finished — try asking again.]_'))
      }
      if (truncated) {
        controller.enqueue(encoder.encode('\n\n_[Response was cut off for being too long — try asking a more specific question.]_'))
      }
      controller.close()
    },
  })
}

// Behavior/scope instructions — WHO the assistant is and what it should and
// shouldn't do. Kept separate from grounding.ts, which is purely reference
// content about the app itself, so the two can be edited independently.
const ROLE_INSTRUCTIONS = `
You are Tally, the in-app assistant for DBC Ledger, a Philippines-focused
bookkeeping app. You're drawn as a small, cheerful ledger book. Your job is
to help whoever's using the app right now understand how to use it — where
to find things, what a field or report means, how a workflow works end to
end — and to explain their own numbers when a data summary is provided.

Personality:
- Warm, calm and encouraging, like a patient bookkeeper friend. Short,
  plain sentences — many users are busy owners, not accountants.
- Reply in the user's language: English, Filipino, or Taglish, matching
  how they wrote to you.
- You like it when books balance ("tally"). A light touch is fine — at
  most one small playful line, never at the expense of a clear answer.
- When you name a page of the app, write its exact sidebar name in bold,
  e.g. **Vouchers**, **Chart of Accounts**, **Closing Books**,
  **Settings**. The app turns those into "Go to" buttons.
- Never invent or estimate a number. If it isn't in the data summary, say
  you can't see it and point to the page where they can check.

Rules:
- Answer ONLY from the reference document below and the account data
  summary (if provided) in this same prompt. Do not use outside knowledge
  about accounting software, BIR rules, or tax law beyond what's written
  here.
- If something isn't covered in the reference doc or the data summary,
  say so plainly rather than guessing or estimating.
- Never give tax or legal advice — which tax scheme to register under,
  whether something is taxable, what ATC code applies, filing deadlines,
  penalties. Explain what the relevant app feature does; for the actual
  compliance judgment call, say that's a question for their accountant or
  BIR directly.
- Keep answers short and direct. This is a busy bookkeeper trying to get
  back to work, not someone reading documentation for fun.
- If a question is about data (e.g. "how many vouchers are unposted") and
  a data summary was provided in this prompt, answer from it directly. If
  no data summary was provided, or the summary doesn't cover what was
  asked, say you don't have access to that right now rather than guessing.
`.trim()

function buildSystemPrompt(dataSummaryText: string | null): string {
  const parts = [ROLE_INSTRUCTIONS, '\n# Reference: How DBC Ledger Works\n', GROUNDING_DOC]
  if (dataSummaryText) {
    parts.push('\n# This User\'s Current Account Data\n', dataSummaryText)
  } else {
    parts.push('\n# This User\'s Current Account Data\n', 'Not provided for this request — decline data questions rather than guessing.')
  }
  return parts.join('\n')
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Help-Provider',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (!GEMINI_API_KEY && !GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: 'No AI provider configured — set GEMINI_API_KEY and/or GROQ_API_KEY as Edge Function secrets.' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    // Only real conversation turns go to a provider. The chat widget also
    // keeps its own UI-only entries in the conversation (error notices),
    // and an unknown role makes providers reject the whole request — so
    // one error would otherwise break every later question in that chat.
    const history: ChatMessage[] = (body.messages || [])
      .filter((m: any) => (m?.role === 'user' || m?.role === 'model') && typeof m.text === 'string' && m.text.trim())
      .slice(-10) // last 10 turns is plenty of context for a help chat
    const dataSummaryText: string | null = body.dataSummaryText || null
    const system = buildSystemPrompt(dataSummaryText)

    if (!history.length || history[history.length - 1].role !== 'user') {
      return new Response(JSON.stringify({ error: 'No question to answer.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const providers: Provider[] = []
    if (GEMINI_API_KEY) for (const model of GEMINI_MODELS) providers.push(geminiProvider(model, history, system))
    if (GROQ_API_KEY) providers.push(groqProvider(history, system))

    const failures: { name: string; status: number; detail: string }[] = []
    for (const provider of providers) {
      let resp: Response
      try {
        resp = await provider.request()
      } catch (err) {
        failures.push({ name: provider.name, status: 0, detail: String(err) })
        continue
      }
      if (!resp.ok || !resp.body) {
        failures.push({ name: provider.name, status: resp.status, detail: (await resp.text()).slice(0, 300) })
        continue
      }
      // Visible in Supabase → Edge Functions → help-chat → Logs, which is
      // how to check which provider is actually carrying the load.
      console.log(`help-chat answered by ${provider.name}` + (failures.length ? ` after: ${failures.map(f => `${f.name} (${f.status})`).join(', ')}` : ''))
      return new Response(toPlainTextStream(resp, provider.parse), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'X-Help-Provider': provider.name },
      })
    }

    // Every provider failed. The widget recognizes these two prefixes and
    // shows a specific message for each — "come back later" vs "try again
    // in a minute" mean different things to the person asking.
    console.error('help-chat: all providers failed', JSON.stringify(failures))
    const summary = failures.map(f => `${f.name}: ${f.status || 'network error'}`).join('; ')
    let error = `All AI providers failed (${summary}).`
    if (failures.some(f => f.status === 429)) {
      error = `QUOTA_EXCEEDED: Every AI provider in the chain is out of free quota for now (${summary}). Quotas reset daily — or add another provider key.`
    } else if (failures.some(f => f.status === 503)) {
      error = `MODEL_OVERLOADED: The AI providers are temporarily at capacity (${summary}). Try again in a minute or two.`
    }
    return new Response(JSON.stringify({ error }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
