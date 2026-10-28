#!/usr/bin/env node
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

import { REPO_DIR, SERVER_DIR, config } from './config.mjs'
import { detectLang } from './analyzer.mjs'
import { Store } from './store.mjs'
import { transcribe } from './stt.mjs'
import { createEchoAgent } from './echo-agent.mjs'
import { CONTACT } from './offer.mjs'

const MAX_TEXT = 2000
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const MAX_MESSAGES = 100

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }

// Files the static handler may serve (the page, widget and dashboard only —
// never .env, server sources or git metadata).
const STATIC = {
  '/': join(REPO_DIR, 'consultoria-ia.html'),
  '/consultoria-ia.html': join(REPO_DIR, 'consultoria-ia.html'),
  '/chat-widget.js': join(REPO_DIR, 'chat-widget.js'),
  '/dashboard': join(SERVER_DIR, 'public', 'dashboard.html'),
}

export async function createApp ({ agent } = {}) {
  agent ??= config.agentMode === 'echo'
    ? createEchoAgent()
    : (await import('./dsh-agent.mjs')).createDshAgent()
  const store = new Store()
  const sseClients = new Set()
  const busy = new Set()

  store.on('event', (ev) => {
    const frame = `data: ${JSON.stringify(ev)}\n\n`
    for (const res of sseClients) res.write(frame)
  })

  // The ONE pipeline both typed and spoken input go through.
  async function handleUserText (conv, text, { via = 'text', sttSeconds = 0 } = {}) {
    store.addMessage(conv, 'user', text, { via })
    if (sttSeconds > 0) store.addUsage(conv, { model: config.stt.model, sttSeconds, costUsd: sttSeconds / 60 * 0.006 })
    store.setStatus(conv, 'thinking')
    try {
      const out = await agent.ask(conv, text)
      store.addMessage(conv, 'assistant', out.text)
      store.addUsage(conv, out.usage)
      return { reply: out.text, usage: store.summary(conv).usage }
    } finally {
      store.setStatus(conv, 'open')
    }
  }

  function guard (conv, res) {
    if (!conv) return json(res, 404, { error: 'conversation not found' }), false
    if (busy.has(conv.id)) return json(res, 409, { error: 'previous message still being answered' }), false
    if (conv.messages.length >= MAX_MESSAGES) return json(res, 429, { error: 'conversation limit reached', contact: CONTACT.email }), false
    return true
  }

  async function run (conv, res, fn) {
    busy.add(conv.id)
    try {
      json(res, 200, await fn())
    } catch (err) {
      console.error(`[server] ${conv.id}:`, err.message)
      json(res, 502, { error: 'agent_unavailable', message: err.message })
    } finally {
      busy.delete(conv.id)
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const path = url.pathname
    cors(res)
    if (req.method === 'OPTIONS') return res.writeHead(204).end()

    try {
      // ---- public API (conversation ids are unguessable capabilities) ----
      if (req.method === 'GET' && path === '/api/health') {
        return json(res, 200, { ok: true, agent: agent.mode, model: config.dsh.model, voice: config.stt.provider === 'mock' || !!process.env.OPENAI_API_KEY })
      }
      if (req.method === 'POST' && path === '/api/conversations') {
        const body = await readJson(req)
        const lang = body.lang === 'en' ? 'en' : 'pt'
        const conv = store.create({ lang, meta: { ua: String(req.headers['user-agent'] ?? '').slice(0, 120), page: String(body.page ?? '').slice(0, 200) } })
        return json(res, 201, { id: conv.id, lang })
      }
      let m = path.match(/^\/api\/conversations\/([\w-]+)\/messages$/)
      if (m && req.method === 'POST') {
        const conv = store.get(m[1])
        if (!guard(conv, res)) return
        const body = await readJson(req)
        const text = String(body.text ?? '').trim()
        if (!text) return json(res, 400, { error: 'text is required' })
        if (text.length > MAX_TEXT) return json(res, 413, { error: `text exceeds ${MAX_TEXT} characters` })
        if (conv.messages.length === 0) conv.lang = detectLang(text, body.lang ?? conv.lang)
        return run(conv, res, () => handleUserText(conv, text))
      }
      // Voice input: the browser records with MediaRecorder and posts the raw
      // audio; it is transcribed, then enters the SAME pipeline as typed text.
      m = path.match(/^\/api\/conversations\/([\w-]+)\/audio$/)
      if (m && req.method === 'POST') {
        const conv = store.get(m[1])
        if (!guard(conv, res)) return
        const audio = await readBody(req, MAX_AUDIO_BYTES)
        if (audio.length === 0) return json(res, 400, { error: 'empty audio' })
        const mime = String(req.headers['content-type'] ?? 'audio/webm').split(';')[0]
        return run(conv, res, async () => {
          const t = await transcribe({ audio, mime, lang: conv.lang })
          if (!t.text) return { transcript: '', reply: null, usage: store.summary(conv).usage }
          return { transcript: t.text, ...await handleUserText(conv, t.text, { via: 'voice', sttSeconds: t.seconds }) }
        })
      }

      // ---- admin API (dashboard) ----
      if (path.startsWith('/api/') ) {
        if (!authorized(req, url)) return json(res, 401, { error: 'unauthorized' })
        if (req.method === 'GET' && path === '/api/conversations') return json(res, 200, { totals: store.totals(), conversations: store.list(), notifications: store.recentNotifications() })
        m = path.match(/^\/api\/conversations\/([\w-]+)$/)
        if (m && req.method === 'GET') {
          const conv = store.get(m[1])
          if (!conv) return json(res, 404, { error: 'conversation not found' })
          return json(res, 200, { ...store.summary(conv), messages: conv.messages, notifications: conv.notifications })
        }
        if (req.method === 'GET' && path === '/api/events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
          res.write(`data: ${JSON.stringify({ type: 'hello', totals: store.totals() })}\n\n`)
          sseClients.add(res)
          const ping = setInterval(() => res.write(': ping\n\n'), 15000)
          req.on('close', () => { clearInterval(ping); sseClients.delete(res) })
          return
        }
        return json(res, 404, { error: 'not found' })
      }

      // ---- static ----
      const file = STATIC[normalize(path)]
      if (req.method === 'GET' && file) {
        const data = await readFile(file)
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
        return res.end(data)
      }
      json(res, 404, { error: 'not found' })
    } catch (err) {
      if (!res.headersSent) json(res, err.status ?? 500, { error: err.message })
      else res.end()
    }
  })

  function authorized (req, url) {
    if (!config.adminToken) return true
    return (req.headers['x-admin-token'] ?? url.searchParams.get('token')) === config.adminToken
  }

  return {
    server,
    store,
    agent,
    async listen (port = config.port, host = config.host) {
      await agent.start()
      await new Promise((resolve) => server.listen(port, host, resolve))
      return server.address().port
    },
    async close () {
      for (const res of sseClients) res.end()
      await new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.() })
      await agent.close()
    },
  }
}

function cors (res) {
  res.setHeader('access-control-allow-origin', config.corsOrigin)
  res.setHeader('access-control-allow-headers', 'content-type, x-admin-token')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
}

function json (res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody (req, limit) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limit) throw Object.assign(new Error('payload too large'), { status: 413 })
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

async function readJson (req) {
  const buf = await readBody(req, 64 * 1024)
  if (buf.length === 0) return {}
  try { return JSON.parse(buf.toString('utf8')) } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApp()
  const port = await app.listen()
  console.log(`[server] http://${config.host}:${port}  page=/  dashboard=/dashboard  agent=${app.agent.mode}${config.adminToken ? '' : '  (ADMIN_TOKEN unset: dashboard open)'}`)
  const stop = async () => { await app.close(); process.exit(0) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
