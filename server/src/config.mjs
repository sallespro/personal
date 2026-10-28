import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const REPO_DIR = resolve(SERVER_DIR, '..')

// Minimal .env loader (same contract as dsh-dynamic-agent): real env wins.
export function loadDotEnv (path) {
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim()
    if (key === '' || process.env[key] !== undefined) continue
    process.env[key] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/s, '$2')
  }
}

// The repo-root .env (shared with the page tooling) first, then server/.env.
loadDotEnv(join(REPO_DIR, '.env'))
loadDotEnv(join(SERVER_DIR, '.env'))

const HARNESS = process.env.DSH_HARNESS ?? join(homedir(), 'dev', 'deepseek-harness')

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  agentMode: process.env.AGENT_MODE ?? 'dsh', // 'dsh' (real) | 'echo' (offline, deterministic)
  dsh: {
    harness: HARNESS,
    bin: process.env.DSH_BIN ?? join(HARNESS, 'apps', 'cli', 'lib', 'bin.js'),
    home: process.env.DSH_HOME ?? join(HARNESS, '.dsh-home'),
    profile: process.env.DSH_PROFILE ?? 'sdk',
    provider: process.env.DSH_PROVIDER ?? 'openai',
    model: process.env.DSH_MODEL ?? 'gpt-4o-mini',
  },
  stt: {
    provider: process.env.STT_PROVIDER ?? 'openai',
    model: process.env.STT_MODEL ?? 'whisper-1',
  },
  // Optional shared secret for the dashboard + admin API (unset = open, dev only).
  adminToken: process.env.ADMIN_TOKEN ?? '',
  // Browser origins allowed to call the API (the page is on GitHub Pages in prod).
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
}

// USD per 1M tokens. Estimates only — keep in sync with the provider's list.
export const PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'whisper-1': { perMinute: 0.006 },
  'gpt-4o-mini-transcribe': { perMinute: 0.003 },
}

export function estimateCost (model, inputTokens, outputTokens) {
  const p = PRICING[model]
  if (!p || p.input === undefined) return 0
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}
