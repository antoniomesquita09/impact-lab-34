import { respostaDemo } from './demo'

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
export const CENTRO_RIO = { longitude: -43.35, latitude: -22.91, zoom: 10 }

const token = () => localStorage.getItem('token') || ''

// Modo demonstração: liga sozinho quando a API não responde (o Supabase ainda
// não existe) e pode ser forçado com ?demo=1. Fica visível na tela — nenhum
// número de demonstração é apresentado como se tivesse vindo do banco.
const FORCADO = new URLSearchParams(location.search).has('demo')
let emDemo = FORCADO
const ouvintes = new Set()

export const modoDemo = () => emDemo
export function aoMudarModo(fn) {
  ouvintes.add(fn)
  return () => ouvintes.delete(fn)
}
function ligarDemo(motivo) {
  if (emDemo) return
  emDemo = true
  console.warn('[matrícula] modo demonstração ligado:', motivo)
  ouvintes.forEach((fn) => fn(true))
}

export class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem)
    this.status = status
  }
}

export async function api(caminho, corpo, metodo) {
  const opcoes = {
    method: metodo || (corpo ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }

  if (emDemo) return demoOuErro(caminho, corpo)

  let r
  try {
    r = await fetch(caminho, opcoes)
  } catch {
    // rede fora, back não subiu, proxy do Vite sem destino
    ligarDemo('a API não respondeu')
    return demoOuErro(caminho, corpo)
  }

  if (r.status >= 500) {
    ligarDemo(`a API respondeu ${r.status}`)
    return demoOuErro(caminho, corpo)
  }

  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroApi(j.erro || 'Algo deu errado. Tente de novo.', r.status)
  return j
}

function demoOuErro(caminho, corpo) {
  const j = respostaDemo(caminho, corpo)
  if (j === null) {
    throw new ErroApi('Esta parte não funciona no modo demonstração.', 503)
  }
  return j
}

export const sair = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('nome')
}
