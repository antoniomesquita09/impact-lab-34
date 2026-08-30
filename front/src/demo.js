// Dados de demonstração.
//
// Servem para o fluxo continuar navegável quando a API não responde (o banco
// ainda não existe). Toda tela que roda com estes dados mostra um aviso — a
// aplicação nunca apresenta número de demonstração como se viesse do banco.
//
// Os nomes e bairros das unidades são reais (base 04_UnidadesEscolaresComEndereco
// do dadoscreche). As coordenadas são aproximadas e as chances são ilustrativas.

const PERGUNTAS = [
  { id: 28, texto: 'A família está inscrita no CadÚnico?', pontos: 51, desempate: false, validavel: true },
  { id: 31, texto: 'A criança aguardou em lista de espera no processo anterior?', pontos: 27, desempate: false, validavel: true },
  { id: 2, texto: 'A criança tem alguma deficiência?', pontos: 25, desempate: false, validavel: true },
  { id: 7, texto: 'A criança está sob guarda, tutela ou acolhimento institucional?', pontos: 25, desempate: false, validavel: true },
  { id: 9, texto: 'A responsável é a única provedora da família?', pontos: 12, desempate: false, validavel: false },
  { id: 11, texto: 'A responsável está trabalhando ou estudando?', pontos: 12, desempate: false, validavel: false },
  { id: 12, texto: 'A responsável está em situação de violência doméstica?', pontos: 25, desempate: false, validavel: false },
  { id: 14, texto: 'A criança tem irmão já matriculado na unidade?', pontos: 10, desempate: false, validavel: true },
  { id: 16, texto: 'Alguém na família está em tratamento de saúde que impeça o cuidado da criança?', pontos: 12, desempate: false, validavel: false },
  { id: 17, texto: 'A família está em situação de rua ou moradia provisória?', pontos: 25, desempate: false, validavel: false },
  { id: 19, texto: 'Algum responsável tem deficiência?', pontos: 12, desempate: false, validavel: true },
  { id: 22, texto: 'A criança é gêmea ou de parto múltiplo?', pontos: 0, desempate: true, validavel: false },
  { id: 24, texto: 'A responsável tem menos de 18 anos?', pontos: 10, desempate: false, validavel: true },
]

// o que a Prefeitura já confirma sozinha, com o carimbo de proveniência
const VALIDADAS = {
  28: { valor: true, fonte: 'CadÚnico', orgao: 'MDS', referencia: 'consulta de 30/08/2026', confianca: 'alta' },
  31: { valor: true, fonte: 'Inscrição Creche', orgao: 'SME', referencia: 'processo 195/2025', confianca: 'alta' },
  2: { valor: false, fonte: 'RMI', orgao: 'Prefeitura do Rio', referencia: 'consulta de 30/08/2026', confianca: 'media' },
  14: { valor: false, fonte: 'Sistema de Gestão Acadêmica', orgao: 'SME', referencia: 'consulta de 30/08/2026', confianca: 'alta' },
  24: { valor: false, fonte: 'RMI', orgao: 'Prefeitura do Rio', referencia: 'consulta de 30/08/2026', confianca: 'alta' },
}

export const NAO_VERIFICAVEIS = [17, 16, 12]

export const preparar = () => ({
  perguntas: PERGUNTAS.map((q) => {
    const v = VALIDADAS[q.id]
    return v
      ? { ...q, validada: true, valor: v.valor, fonte: v.fonte, orgao: v.orgao, referencia: v.referencia, confianca: v.confianca }
      : { ...q, validada: false, valor: null, confianca: NAO_VERIFICAVEIS.includes(q.id) ? 'nao_verificavel' : '' }
  }),
  contato: {
    nome: 'Ana Souza',
    nascimento: '1996-04-12',
    menor_idade: false,
    endereco: {
      logradouro: 'R. Barão de Mesquita',
      numero: '500',
      bairro: 'Tijuca',
      cep: '20540-003',
      latitude: -22.9245,
      longitude: -43.2445,
    },
    telefone: { ddd: '21', numero: '98•••-4471', atualizado_em: '2025-11-03' },
  },
  encontrado: true,
  nao_verificaveis: NAO_VERIFICAVEIS,
  grupamentos: ['Berçário', 'Maternal I', 'Maternal II'],
  horarios: ['Integral', 'Parcial'],
})

const RECOMENDADAS = [
  { cod: '0209803', nome: 'EDI Prof.ª Suely de Pinho Cavalcante', bairro: 'Vila Isabel', lat: -22.9175, lon: -43.2515, km: 0.9, p_pct: 68,
    motivo: 'Perto da sua referência e com histórico de fila curta no Berçário integral.' },
  { cod: '0208802', nome: 'EDI Dr. Marcelo Candia', bairro: 'Tijuca', lat: -22.9310, lon: -43.2380, km: 1.4, p_pct: 54,
    motivo: 'A 1,4 km e com entrada acima da média da rede nos últimos três processos.' },
  { cod: '02010', nome: 'CP Creche Patinho Feliz', bairro: 'Vila Isabel', lat: -22.9120, lon: -43.2490, km: 1.8, p_pct: 41,
    motivo: 'Unidade parceira, entrou na rede em 2024 e ainda tem vaga ociosa no integral.' },
  { cod: '0208804', nome: 'EDI Chácara do Céu', bairro: 'Tijuca', lat: -22.9350, lon: -43.2270, km: 2.6, p_pct: 33,
    motivo: 'Um pouco mais longe, mas com fila menor que as unidades vizinhas.' },
  { cod: '02043', nome: 'CP Creche Santa Mônica', bairro: 'Tijuca', lat: -22.9400, lon: -43.2200, km: 3.4, p_pct: 22,
    motivo: 'Procura alta no Berçário: costuma chamar poucas crianças da lista de espera.' },
]

// pontos cinza do mapa: espalhados pela cidade, com semente fixa para não
// mudarem a cada render
function outrasUnidades() {
  let s = 20260830
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const lista = []
  for (let i = 0; i < 120; i++) {
    lista.push({
      cod: `demo-${i}`,
      nome: 'Unidade da rede municipal',
      bairro: '',
      lat: -22.86 - r() * 0.18,
      lon: -43.19 - r() * 0.32,
    })
  }
  return lista
}

export const recomendacoes = (raioKm = 5) => ({
  referencia: { lat: -22.9245, lon: -43.2445, texto: 'R. Barão de Mesquita, 500 — Tijuca' },
  grupamento: 'Berçário',
  horario: 'Integral',
  raio_km: raioKm,
  raio_ampliado: false,
  recomendadas: RECOMENDADAS,
  todas: [...RECOMENDADAS.map(({ cod, nome, lat, lon, bairro }) => ({ cod, nome, lat, lon, bairro })), ...outrasUnidades()],
})

export const estado = () => ({
  score: 78,
  grupamento: 'Berçário',
  horario: 'Integral',
  ref_texto: 'R. Barão de Mesquita, 500 — Tijuca',
  opcoes: ['0209803', '0208802', '02010'],
})

// resposta de demonstração por rota; `null` = a rota não tem substituto e o
// erro precisa aparecer para a família
export function respostaDemo(caminho, corpo) {
  if (caminho.startsWith('/api/auth/')) return { token: 'demo', nome: corpo?.nome || 'Ana Souza' }
  if (caminho === '/api/eu') return { cpf: '10000000019', nome: 'Ana Souza' }
  if (caminho === '/api/inscricao/preparar') return preparar()
  if (caminho === '/api/inscricao/respostas') return { score: 78, grupamento: 'Berçário' }
  if (caminho === '/api/inscricao/referencia') {
    if (corpo?.lat != null) return { lat: corpo.lat, lon: corpo.lon, texto: corpo.texto || 'Ponto marcado no mapa' }
    return { lat: -22.9245, lon: -43.2445, texto: 'R. Barão de Mesquita, 500 — Tijuca' }
  }
  if (caminho.startsWith('/api/inscricao/recomendacoes')) {
    const raio = Number(new URLSearchParams(caminho.split('?')[1] || '').get('raio_km')) || 5
    return recomendacoes(raio)
  }
  if (caminho === '/api/inscricao/opcoes') return { ok: true, opcoes: corpo?.unidades || [] }
  if (caminho === '/api/inscricao') return estado()
  return null
}
