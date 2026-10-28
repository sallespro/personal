// Offline stand-in for the dsh agent (AGENT_MODE=echo): deterministic replies
// and synthetic token counts, so API/UI tests run with no network or key.
export function createEchoAgent () {
  return {
    mode: 'echo',
    async start () {},
    async ask (conv, text) {
      const reply = conv.lang === 'pt' ? `Entendi: "${text}". Posso ajudar com mais detalhes.` : `Got it: "${text}". Happy to give more detail.`
      return { text: reply, usage: { model: 'gpt-4o-mini', inputTokens: 200 + text.length, outputTokens: 20 + reply.length } }
    },
    async close () {},
  }
}
