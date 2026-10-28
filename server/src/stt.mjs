import { config } from './config.mjs'

// Speech-to-text seam. The chat pipeline only ever sees TEXT: audio is turned
// into a transcript here and then handled exactly like a typed message
// (server.mjs -> handleUserText). Swapping providers = implementing
// `transcribe({ audio: Buffer, mime, lang }) -> { text, seconds }`.

const providers = {
  // OpenAI audio transcription (uses the same OPENAI_API_KEY as the agent).
  async openai ({ audio, mime, lang }) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
    const ext = /ogg/.test(mime) ? 'ogg' : /mp4|aac|m4a/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : /mpeg|mp3/.test(mime) ? 'mp3' : 'webm'
    const form = new FormData()
    form.set('model', config.stt.model)
    form.set('response_format', 'verbose_json')
    if (lang) form.set('language', lang)
    form.set('file', new Blob([audio], { type: mime || 'audio/webm' }), `audio.${ext}`)
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    })
    if (!res.ok) throw new Error(`transcription failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    return { text: (json.text ?? '').trim(), seconds: Number(json.duration ?? 0) }
  },

  // Offline provider for tests: the "audio" bytes are the UTF-8 transcript.
  async mock ({ audio }) {
    const text = audio.toString('utf8')
    return { text, seconds: Math.max(1, Math.round(text.length / 15)) }
  },
}

export async function transcribe (input) {
  const fn = providers[config.stt.provider]
  if (!fn) throw new Error(`unknown STT_PROVIDER "${config.stt.provider}"`)
  return fn(input)
}
