// DBC Ledger — Help Assistant Edge Function
// -------------------------------------------------------------------------
// Sits between the chat widget in the app and the Gemini API. This is the
// ONLY place the real Gemini API key ever exists — it's read from an Edge
// Function secret, never sent to the browser. See README.md in this folder
// for deployment steps.
//
// By default, Supabase Edge Functions require a valid Supabase auth JWT to
// call them at all (unless deployed with --no-verify-jwt, which we are NOT
// doing) — so only people actually logged into the app can reach this at
// all. That's the first line of defense against random internet traffic
// burning through the Gemini quota.

import { GROUNDING_DOC } from './grounding.ts'

// The model name is deliberately a config value, not hardcoded logic —
// Google renames/retires Gemini model IDs often (gemini-2.0-flash and the
// entire 1.5 family were both retired mid-2026). Set GEMINI_MODEL as an
// Edge Function secret to change it without touching this file. Falls back
// to gemini-3.5-flash, the model picked deliberately over the newer
// gemini-3.6-flash for having a longer production track record — see
// chat history for that reasoning; revisit once 3.6 has matured.
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash'
const API_KEY = Deno.env.get('GEMINI_API_KEY')

// Behavior/scope instructions — WHO the assistant is and what it should and
// shouldn't do. Kept separate from grounding.ts, which is purely reference
// content about the app itself, so the two can be edited independently.
const ROLE_INSTRUCTIONS = `
You are the in-app help assistant for DBC Ledger, a Philippines-focused
bookkeeping app. Your job is to help whoever's using the app right now
understand how to use it — where to find things, what a field or report
means, how a workflow works end to end.

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
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured on the server.' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const messages: { role: 'user' | 'model'; text: string }[] = body.messages || []
    const dataSummaryText: string | null = body.dataSummaryText || null

    // Cap history so a long conversation doesn't get slower/pricier the
    // longer someone talks — last 10 turns is plenty of context for a
    // help chat.
    const recentMessages = messages.slice(-10)

    const contents = recentMessages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }],
    }))

    const geminiReq = {
      contents,
      systemInstruction: { parts: [{ text: buildSystemPrompt(dataSummaryText) }] },
      generationConfig: {
        temperature: 0.3, // low — this should answer reliably from the doc, not improvise
        maxOutputTokens: 800, // a help answer shouldn't need an essay
      },
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${API_KEY}`

    const geminiResp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiReq),
    })

    if (!geminiResp.ok || !geminiResp.body) {
      const errText = await geminiResp.text()
      return new Response(JSON.stringify({ error: `Gemini API error: ${errText}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Re-emit Gemini's SSE stream as plain incremental text chunks — the
    // frontend just appends whatever text arrives, with no need to know
    // Gemini's specific response shape. This also means swapping to a
    // different provider later only touches this file, not the widget.
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    const reader = geminiResp.body.getReader()

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr || jsonStr === '[DONE]') continue
            try {
              const parsed = JSON.parse(jsonStr)
              const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
              if (text) controller.enqueue(encoder.encode(text))
            } catch {
              // Ignore malformed SSE fragments (partial JSON split across
              // chunks) — the next chunk's data usually recovers it.
            }
          }
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
