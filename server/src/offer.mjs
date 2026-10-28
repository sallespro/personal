// Single source of truth for what the agent may say about the service offer.
// Mirrors the copy on consultoria-ia.html. Anything not listed here (price,
// open slots, ...) is deliberately absent so the agent must say it is unknown
// and hand the customer to the contact channel rather than invent it.

export const CONTACT = {
  brand: 'cloudpilot',
  email: 'hello@cloudpilot.com.br',
  site: 'ai.cloudpilot.com.br',
  address: 'MC Souza, 95 – Florianópolis-SC',
}

export const OFFER = {
  summary: {
    pt: 'Consultoria personalizada em IA para executivos: conversas privadas e diretas, com foco total nas dúvidas e nos objetivos do cliente com Inteligência Artificial. Em um encontro direto e reservado, o cliente leva suas perguntas e o consultor traz clareza, contexto e direcionamento sobre o que a IA pode fazer pelo negócio, a carreira e os projetos. Mais que informação. Direção.',
    en: 'Personalized AI consulting for executives: private, direct conversations fully focused on the client\'s questions and goals with Artificial Intelligence. In a direct, private meeting the client brings questions and the consultant brings clarity, context and direction on what AI can do for their business, career and projects. More than information. Direction.',
  },
  topics: {
    pt: '1) IA Generativa: ChatGPT, Copilot, Claude, Gemini e outros. 2) Estratégia e Negócios: casos de uso, ROI, competitividade, inovação. 3) Desenvolvimento de Software: automação, agentes, APIs, integrações, código assistido. 4) Produtividade Pessoal: ferramentas, organização, gestão do tempo.',
    en: '1) Generative AI: ChatGPT, Copilot, Claude, Gemini and others. 2) Strategy and Business: use cases, ROI, competitiveness, innovation. 3) Software Development: automation, agents, APIs, integrations, AI-assisted coding. 4) Personal Productivity: tools, organization, time management.',
  },
  process: {
    pt: 'Como funciona: 1) Você traz suas perguntas (um desafio atual, uma ideia ou uma simples curiosidade). 2) Conversamos no seu ritmo, em ambiente tranquilo e reservado, com foco total em você. 3) O consultor traz respostas e caminhos, com base em experiência prática, visão estratégica e amplo conhecimento em IA. 4) Você sai com clareza e próximos passos, aplicáveis à sua realidade, de forma direta e objetiva.',
    en: 'How it works: 1) You bring your questions (a current challenge, an idea or simple curiosity). 2) We talk at your pace, in a calm, private setting, fully focused on you. 3) The consultant brings answers and paths forward, drawing on hands-on experience, strategic vision and broad AI expertise. 4) You leave with clarity and next steps, applicable to your reality, direct and objective.',
  },
  guarantees: {
    pt: 'Atendimento exclusivo para executivos. Total confidencialidade: suas perguntas, seu tempo, sua privacidade. Foco em resultados reais: da teoria à aplicação no dia a dia.',
    en: 'Exclusive service for executives. Complete confidentiality: your questions, your time, your privacy. Focus on real results: from theory to practice in your daily work.',
  },
  location: {
    pt: 'Florianópolis · SC e onde você estiver (atendimento também remoto). Endereço: MC Souza, 95 – Florianópolis-SC.',
    en: 'Florianópolis · Brazil and wherever you are (remote sessions also available). Address: MC Souza, 95 – Florianópolis, Brazil.',
  },
  booking: {
    pt: `Para agendar, entre em contato por e-mail (${CONTACT.email}) ou pelo site ${CONTACT.site}. Preços, valores, duração das sessões e disponibilidade de agenda NÃO estão publicados: não informe nenhum número, apenas encaminhe ao contato.`,
    en: `To book, contact ${CONTACT.email} or ${CONTACT.site}. Prices, fees, session length and calendar availability are NOT published: never state any figure, just refer the customer to the contact channel.`,
  },
}

export const SECTION_NAMES = Object.keys(OFFER)

export function offerSection (section, lang = 'pt') {
  const entry = OFFER[section]
  if (!entry) return null
  return entry[lang] ?? entry.pt
}

export function offerAll (lang = 'pt') {
  return SECTION_NAMES.map((s) => `## ${s}\n${offerSection(s, lang)}`).join('\n\n')
}
