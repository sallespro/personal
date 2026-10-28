// Turns a customer message into dashboard "headline" notifications.
// Deliberately rule-based (pt + en): free, instant, deterministic, testable.
// To make it smarter later, replace `analyze` with an LLM call — callers only
// rely on the returned [{ topic, headline }] shape.

const RULES = [
  { topic: 'price', headline: { pt: 'Cliente perguntando sobre preço', en: 'Customer asking about price' },
    re: /\b(pre[cç]o|valor(es)?|quanto (custa|cobra|[eé])|custo|cobran[cç]a|investimento|or[cç]amento|pacote|price|pricing|cost|how much|fee|rate|quote|budget)\b/i },
  { topic: 'agenda', headline: { pt: 'Cliente perguntando sobre agenda / disponibilidade', en: 'Customer asking about agenda / availability' },
    re: /\b(agenda(r|mento)?|hor[aá]rio|disponibilidade|dispon[ií]vel|marcar|reuni[aã]o|encontro|data|semana|amanh[aã]|schedule|book(ing)?|availab\w*|calendar|appointment|meeting|slot|when)\b/i },
  { topic: 'duration', headline: { pt: 'Cliente perguntando sobre duração da sessão', en: 'Customer asking about session length' },
    re: /\b(dura[cç][aã]o|quanto tempo|quantas horas|how long|duration|how many hours)\b/i },
  { topic: 'confidentiality', headline: { pt: 'Cliente preocupado com confidencialidade', en: 'Customer concerned about confidentiality' },
    re: /\b(confidencial\w*|sigilo|privacidade|privad[ao]|privacy|confidential\w*|nda|private)\b/i },
  { topic: 'remote', headline: { pt: 'Cliente perguntando sobre atendimento remoto / local', en: 'Customer asking about remote / location' },
    re: /\b(remot[oa]|online|presencial|videochamada|floripa|florian[oó]polis|onde|location|remote|in[- ]person|where)\b/i },
  { topic: 'topics', headline: { pt: 'Cliente perguntando sobre os temas abordados', en: 'Customer asking about topics covered' },
    re: /\b(t[oó]picos?|temas?|assuntos?|abordam?|cobre|topics?|cover(ed)?|subjects?|ia generativa|chatgpt|agentes?|agents?|automa[cç][aã]o|automation)\b/i },
  { topic: 'process', headline: { pt: 'Cliente perguntando como funciona', en: 'Customer asking how it works' },
    re: /\b(como funciona|funciona como|passo a passo|processo|how (does it|it) work|process|what happens)\b/i },
  { topic: 'contact', headline: { pt: 'Cliente quer entrar em contato', en: 'Customer wants to get in touch' },
    re: /\b(contato|contatar|e-?mail|telefone|whats\w*|falar com|contact|call me|reach|phone)\b/i },
  { topic: 'buying-intent', headline: { pt: 'Possível intenção de contratar', en: 'Possible buying intent' },
    re: /\b(quero contratar|tenho interesse|vamos fechar|quero agendar|contratar|i want to (book|hire)|i'?m interested|sign me up|let'?s do it|hire you)\b/i },
]

export function analyze (text) {
  const out = []
  for (const rule of RULES) {
    if (rule.re.test(text)) out.push({ topic: rule.topic, headline: rule.headline })
  }
  return out
}

export function detectLang (text, hint) {
  if (hint === 'pt' || hint === 'en') return hint
  return /[ãõçáéíóúâêô]|\b(você|voce|quanto|como|quero|preço|olá|ola|bom dia|obrigad[oa])\b/i.test(text) ? 'pt' : 'en'
}
