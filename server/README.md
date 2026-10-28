# Offer chat backend

Backend for `consultoria-ia.html`: a **DeepSeek Harness dynamic agent** answers
questions about the service offer when a visitor clicks **"Let's talk" /
"Vamos conversar?"**, and a **dashboard** shows who is chatting right now, intent
headlines ("customer asking about price / agenda …") and tokens + cost per
conversation.

```
page (webjsx) ──click──▶ chat-widget.js ──HTTP──▶ server/src/server.mjs ──▶ dsh agent (OpenAI gpt-4o-mini)
                           │ text / mic audio          │  store + analyzer ──SSE──▶ /dashboard
```

## Run

```bash
cd server && npm install
cp .env.example .env   # or rely on the repo-root .env (OPENAI_API_KEY)
npm start              # http://127.0.0.1:8787  (page: /, dashboard: /dashboard?token=…)
```

Needs a built deepseek-harness checkout with an `sdk` profile — see
[dsh-dynamic-agent](https://github.com/sallespro/dsh-dynamic-agent#setup)
(`DSH_HARNESS`, default `~/dev/deepseek-harness`). `AGENT_MODE=echo` runs without
any of that (deterministic canned replies, used by the offline tests).

## How the agent is built

`src/dsh-agent.mjs` uses the dsh-dynamic-agent technique: at boot it **authors a
Cordis plugin at runtime** (`offer_info` tool serving `src/offer.mjs`), writes it
into the sdk profile, and mounts it with a patch. The same patch points the model
at OpenAI via pi-ai and **disables every coding-agent tool** (bash, fs, web,
subagents, …) so a public visitor can only reach `offer_info`. One dsh subprocess
serves all visitors; **conversation id = dsh session id**, so context persists.

Facts the agent may state live only in `src/offer.mjs`. Price, duration and
availability are intentionally *not* there: the agent says they are unpublished
and points to the contact e-mail.

## API

Public (the conversation id is the capability):

| | |
|---|---|
| `POST /api/conversations` `{lang}` | → `{id}` |
| `POST /api/conversations/:id/messages` `{text}` | → `{reply, usage}` |
| `POST /api/conversations/:id/audio` raw audio body (`content-type: audio/webm`…) | → `{transcript, reply, usage}` |
| `GET /api/health` | `{ok, agent, model, voice}` |

Admin (`x-admin-token` header or `?token=`; required when `ADMIN_TOKEN` is set):
`GET /api/conversations`, `GET /api/conversations/:id`, `GET /api/events` (SSE).

```bash
ID=$(curl -s -XPOST localhost:8787/api/conversations -d '{"lang":"en"}' | jq -r .id)
curl -s -XPOST localhost:8787/api/conversations/$ID/messages -d '{"text":"How much does it cost?"}'
```

## Voice (speech-to-text)

Already wired end to end, and isolated behind one seam. The widget's 🎤 button
(shown when `/api/health` says `voice:true` and the browser has `MediaRecorder`)
records, posts the audio to `/audio`, `src/stt.mjs` turns it into **text**, and
that text enters `handleUserText` — the same function typed messages use — so the
agent, intent headlines, usage and dashboard behave identically. To change
provider implement `transcribe({audio, mime, lang}) → {text, seconds}` in
`src/stt.mjs` (`STT_PROVIDER=openai|mock`). For true streaming, replace the
single POST with chunked uploads/WebSocket that end by calling the same function.

## Dashboard

`/dashboard?token=…`: live/thinking/idle badge per conversation, topic chips,
last customer message, tokens in/out, estimated cost (`PRICING` in
`src/config.mjs`), plus a live notification feed and per-conversation transcript.
Intent rules (price, agenda, duration, confidentiality, remote, topics, process,
contact, buying-intent; pt + en) are in `src/analyzer.mjs`.

## Tests — one script

```bash
npm test                    # API + browser (Playwright) + live agent
node scripts/test-all.mjs --offline      # no OpenAI / dsh needed
node scripts/test-all.mjs --live         # only the real agent
```

First run: `npx playwright install chromium`.

## Deploy notes

The page can stay on GitHub Pages: set `<meta name="chat-api" content="https://your-backend">`
(or `?api=`) and `CORS_ORIGIN` on the server. Set `ADMIN_TOKEN`. The in-memory
ledger resets on restart.
