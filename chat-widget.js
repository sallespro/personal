// Chat widget for the service-offer page (webjsx). Opens when the "Let's talk"
// button is clicked (page dispatches `cloudpilot:chat-open`), talks to the
// backend in server/, and offers an optional microphone button that records
// audio and posts it to the same conversation (server transcribes, then the
// agent answers exactly as for a typed message).
import { createElement as h, applyDiff } from "https://cdn.jsdelivr.net/npm/webjsx@0.0.73/dist/index.js";

const STR = {
  pt: { title: "Converse com a cloudpilot", sub: "Tire suas dúvidas sobre a consultoria", ph: "Escreva sua pergunta…", send: "Enviar", close: "Fechar", mic: "Gravar áudio", stop: "Parar gravação", rec: "Gravando… toque para enviar", hello: "Olá! Sou o assistente da consultoria em IA. Pergunte sobre temas, como funciona, confidencialidade ou agendamento.", err: "Não consegui responder agora. Tente novamente ou escreva para", off: "Chat indisponível no momento. Escreva para", micDenied: "Microfone indisponível." },
  en: { title: "Talk to cloudpilot", sub: "Ask anything about the consulting offer", ph: "Type your question…", send: "Send", close: "Close", mic: "Record audio", stop: "Stop recording", rec: "Recording… tap to send", hello: "Hi! I'm the AI consulting assistant. Ask about topics, how it works, confidentiality or booking.", err: "I couldn't answer right now. Please retry or write to", off: "Chat is unavailable right now. Please write to", micDenied: "Microphone unavailable." },
};
const EMAIL = "hello@cloudpilot.com.br";

const api = (() => {
  const p = new URLSearchParams(location.search).get("api");
  const m = document.querySelector('meta[name="chat-api"]')?.content;
  // Served by the backend itself (any non-GitHub-Pages http origin): same origin wins over the meta tag.
  const own = location.protocol.startsWith("http") && !/github\.io$/.test(location.hostname) ? location.origin : undefined;
  const base = p ?? window.CHAT_API ?? own ?? m ?? "";
  return base.replace(/\/$/, "");
})();

const state = { open: false, lang: document.documentElement.lang.startsWith("en") ? "en" : "pt", messages: [], busy: false, convId: null, voice: false, ready: false, recording: false, draft: "", offline: false };
let root, recorder, chunks = [], stream;
const t = () => STR[state.lang];

const el = () => {
  const s = t();
  return h("div", { class: "cw-wrap" },
    state.open ? h("div", { class: "cw-panel", role: "dialog", "aria-label": s.title, "data-testid": "chat-panel" },
      h("div", { class: "cw-head" },
        h("div", null, h("b", null, s.title), h("small", null, s.sub)),
        h("button", { class: "cw-x", "aria-label": s.close, "data-testid": "chat-close", onclick: () => { state.open = false; render(); } }, "×")),
      h("div", { class: "cw-log", "data-testid": "chat-log", id: "cw-log" },
        h("div", { class: "cw-msg bot" }, s.hello),
        ...state.messages.map((m) => h("div", { class: `cw-msg ${m.role}${m.error ? " err" : ""}`, "data-testid": `msg-${m.role}`, key: m.id }, m.text)),
        state.busy ? h("div", { class: "cw-msg bot cw-typing", "data-testid": "chat-typing" }, "…") : null),
      state.recording ? h("div", { class: "cw-rec", "data-testid": "chat-recording" }, s.rec) : null,
      h("form", { class: "cw-form", onsubmit: onSubmit },
        h("input", { class: "cw-in", name: "q", autocomplete: "off", placeholder: s.ph, value: state.draft, "data-testid": "chat-input", disabled: state.busy || state.offline || !state.ready, oninput: (e) => { state.draft = e.target.value; } }),
        state.voice ? h("button", { type: "button", class: `cw-mic${state.recording ? " on" : ""}`, "aria-label": state.recording ? s.stop : s.mic, title: state.recording ? s.stop : s.mic, "data-testid": "chat-mic", disabled: state.busy || state.offline, onclick: toggleMic }, state.recording ? "■" : "🎤") : null,
        h("button", { class: "cw-send", type: "submit", "data-testid": "chat-send", disabled: state.busy || state.offline }, s.send))) : null);
};

function render() {
  applyDiff(root, [el()]);
  const log = document.getElementById("cw-log");
  if (log) log.scrollTop = log.scrollHeight;
}

const push = (role, text, extra = {}) => { state.messages.push({ id: crypto.randomUUID(), role, text, ...extra }); };

async function ensureConversation() {
  if (state.convId) return state.convId;
  const r = await fetch(`${api}/api/conversations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: state.lang, page: location.pathname }) });
  if (!r.ok) throw new Error("conversation");
  state.convId = (await r.json()).id;
  return state.convId;
}

async function send(text) {
  push("user", text); state.busy = true; render();
  try {
    const id = await ensureConversation();
    const r = await fetch(`${api}/api/conversations/${id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang: state.lang }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    push("bot", j.reply);
  } catch { push("bot", `${t().err} ${EMAIL}`, { error: true }); }
  state.busy = false; render();
  document.querySelector('[data-testid="chat-input"]')?.focus();
}

function onSubmit(e) {
  e.preventDefault();
  const text = (e.target.q?.value ?? state.draft).trim(); // read the live field: a re-render may race the draft
  if (!text || state.busy) return;
  state.draft = "";
  if (e.target.q) e.target.q.value = "";
  send(text);
}

/* ---- voice: record -> POST raw audio -> same pipeline as text ---- */
async function toggleMic() {
  if (state.recording) { recorder.stop(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      state.recording = false; render();
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      await sendAudio(blob);
    };
    recorder.start();
    state.recording = true; render();
  } catch { push("bot", t().micDenied, { error: true }); render(); }
}

async function sendAudio(blob) {
  state.busy = true; render();
  try {
    const id = await ensureConversation();
    const r = await fetch(`${api}/api/conversations/${id}/audio`, { method: "POST", headers: { "content-type": blob.type || "audio/webm" }, body: blob });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    if (j.transcript) push("user", j.transcript, { voice: true });
    if (j.reply) push("bot", j.reply);
  } catch { push("bot", `${t().err} ${EMAIL}`, { error: true }); }
  state.busy = false; render();
}

/* ---- boot ---- */
const css = document.createElement("style");
css.textContent = `
.cw-wrap{position:fixed;right:20px;bottom:20px;z-index:9999;font:15px/1.4 "Source Sans 3",system-ui,sans-serif}
.cw-panel{width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 40px));background:var(--paper,#fff);color:var(--ink,#2a2f36);border:1px solid var(--line,#cfd3d8);border-radius:14px;box-shadow:0 12px 40px rgba(10,20,40,.35);display:flex;flex-direction:column;overflow:hidden}
.cw-head{background:var(--navy,#1b3050);color:#fff;padding:12px 14px;display:flex;justify-content:space-between;align-items:flex-start}
.cw-head small{display:block;opacity:.75}
.cw-x{background:none;border:0;color:#fff;font-size:24px;line-height:1;cursor:pointer}
.cw-log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.cw-msg{max-width:85%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}
.cw-msg.bot{background:var(--paper-2,#e9e9e6);align-self:flex-start}
.cw-msg.user{background:var(--accent,#2e5486);color:#fff;align-self:flex-end}
.cw-msg.err{border:1px solid #b33}
.cw-rec{background:#b33;color:#fff;text-align:center;padding:4px;font-size:13px}
.cw-form{display:flex;gap:6px;padding:10px;border-top:1px solid var(--line,#cfd3d8)}
.cw-in{flex:1;padding:9px 11px;border:1px solid var(--line,#cfd3d8);border-radius:8px;font:inherit;background:var(--paper,#fff);color:inherit}
.cw-send,.cw-mic{border:0;border-radius:8px;padding:0 14px;font:inherit;cursor:pointer;background:var(--accent,#2e5486);color:#fff}
.cw-mic{background:var(--paper-2,#e9e9e6);color:inherit}.cw-mic.on{background:#b33;color:#fff}
.cw-send:disabled,.cw-mic:disabled,.cw-in:disabled{opacity:.5;cursor:default}
@media print{.cw-wrap{display:none}}`;
document.head.append(css);
root = document.createElement("div");
document.body.append(root);

async function open() {
  state.lang = document.documentElement.lang.startsWith("en") ? "en" : "pt";
  state.open = true;
  state.ready = false;
  render();
  try { // capability probe: chat needs the backend, voice needs backend + browser support
    const r = await fetch(`${api}/api/health`);
    const hl = await r.json();
    state.offline = !r.ok;
    state.voice = !!hl.voice && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  } catch { state.offline = true; push("bot", `${t().off} ${EMAIL}`, { error: true }); }
  state.ready = true;
  render();
  document.querySelector('[data-testid="chat-input"]')?.focus();
}

window.addEventListener("cloudpilot:chat-open", open);
window.CloudpilotChat = { open };
