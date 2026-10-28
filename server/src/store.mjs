import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'

import { analyze } from './analyzer.mjs'
import { estimateCost } from './config.mjs'

// An idle conversation stops being "live" after this long without a message.
const LIVE_WINDOW_MS = 60_000

// In-memory conversation ledger. Everything the dashboard shows lives here and
// is pushed out through the `event` emitter (consumed by the SSE endpoint).
export class Store extends EventEmitter {
  constructor () {
    super()
    this.conversations = new Map()
  }

  create ({ lang = 'pt', meta = {} } = {}) {
    const conv = {
      id: `c_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      lang,
      meta,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: 'open', // open | thinking | closed
      messages: [],
      notifications: [],
      usage: { inputTokens: 0, outputTokens: 0, sttSeconds: 0, requests: 0, costUsd: 0, model: null },
    }
    this.conversations.set(conv.id, conv)
    this.emit('event', { type: 'conversation.started', conversation: this.summary(conv) })
    return conv
  }

  get (id) {
    return this.conversations.get(id)
  }

  setStatus (conv, status) {
    conv.status = status
    conv.lastActivity = Date.now()
    this.emit('event', { type: 'conversation.updated', conversation: this.summary(conv) })
  }

  addMessage (conv, role, content, extra = {}) {
    const msg = { id: randomUUID(), role, content, at: Date.now(), ...extra }
    conv.messages.push(msg)
    conv.lastActivity = msg.at
    this.emit('event', { type: 'message', conversationId: conv.id, message: msg })
    if (role === 'user') {
      for (const hit of analyze(content)) {
        const n = { id: randomUUID(), topic: hit.topic, headline: hit.headline[conv.lang] ?? hit.headline.en, headlines: hit.headline, at: msg.at, excerpt: content.slice(0, 140) }
        conv.notifications.push(n)
        this.emit('event', { type: 'notification', conversationId: conv.id, notification: n, conversation: this.summary(conv) })
      }
    }
    this.emit('event', { type: 'conversation.updated', conversation: this.summary(conv) })
    return msg
  }

  addUsage (conv, { model, inputTokens = 0, outputTokens = 0, sttSeconds = 0, costUsd }) {
    const u = conv.usage
    u.inputTokens += inputTokens
    u.outputTokens += outputTokens
    u.sttSeconds += sttSeconds
    u.requests += 1
    u.model = model ?? u.model
    u.costUsd += costUsd ?? estimateCost(model, inputTokens, outputTokens)
    this.emit('event', { type: 'conversation.updated', conversation: this.summary(conv) })
  }

  isLive (conv) {
    return conv.status !== 'closed' && Date.now() - conv.lastActivity < LIVE_WINDOW_MS
  }

  summary (conv) {
    const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user')
    return {
      id: conv.id,
      lang: conv.lang,
      status: conv.status,
      live: this.isLive(conv),
      createdAt: conv.createdAt,
      lastActivity: conv.lastActivity,
      messageCount: conv.messages.length,
      lastUserMessage: lastUser?.content?.slice(0, 160) ?? null,
      topics: [...new Set(conv.notifications.map((n) => n.topic))],
      usage: { ...conv.usage, totalTokens: conv.usage.inputTokens + conv.usage.outputTokens },
    }
  }

  list () {
    return [...this.conversations.values()].map((c) => this.summary(c)).sort((a, b) => b.lastActivity - a.lastActivity)
  }

  recentNotifications (limit = 30) {
    return [...this.conversations.values()]
      .flatMap((c) => c.notifications.map((n) => ({ ...n, conversationId: c.id, headline: n.headlines[c.lang] ?? n.headline })))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
  }

  totals () {
    const all = [...this.conversations.values()]
    return {
      conversations: all.length,
      live: all.filter((c) => this.isLive(c)).length,
      inputTokens: all.reduce((s, c) => s + c.usage.inputTokens, 0),
      outputTokens: all.reduce((s, c) => s + c.usage.outputTokens, 0),
      costUsd: all.reduce((s, c) => s + c.usage.costUsd, 0),
    }
  }
}
