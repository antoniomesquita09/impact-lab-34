import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { aoMudarModo, modoDemo } from './api'
import { COR, ROTULO } from './faixa'

export const PASSOS = [
  { chave: 'conta', rotulo: 'Conta', caminho: '/entrar' },
  { chave: 'dados', rotulo: 'Dados', caminho: '/inscricao/dados' },
  { chave: 'local', rotulo: 'Local', caminho: '/inscricao/referencia' },
  { chave: 'creches', rotulo: 'Creches', caminho: '/inscricao/creches' },
]

export function Passos({ atual }) {
  const i = PASSOS.findIndex((p) => p.chave === atual)
  return (
    <div className="steps">
      {PASSOS.map((p, k) => (
        <div key={p.chave} className={`step${k < i ? ' done' : ''}${k === i ? ' now' : ''}`}>
          <i />
          <span>{p.rotulo}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Cabeçalho: só o voltar (quando há) e a marca.
 *
 * A marca é centrada por posicionamento absoluto, não por espaçadores
 * invisíveis nas pontas — os espaçadores já viraram "círculos cinzas soltos"
 * duas vezes hoje, quando o cartão que os continha perdeu a moldura.
 */
export function Cabecalho({ voltar }) {
  const navegar = useNavigate()
  return (
    <div className="rail-head">
      {voltar && (
        <button type="button" className="icon-btn" aria-label="Voltar" onClick={() => navegar(voltar)}>
          <Icone nome="voltar" />
        </button>
      )}
      <div className="brand">
        <span className="brandmark"><Icone nome="casa" tamanho={16} /></span>
        <b>Matrícula Carioca</b>
      </div>
    </div>
  )
}

/** Aviso permanente enquanto a tela roda com dados de demonstração. */
export function AvisoDemo() {
  const [ligado, setLigado] = useState(modoDemo())
  useEffect(() => aoMudarModo(setLigado), [])
  if (!ligado) return null
  return (
    <p className="demo-bar" role="status">
      <Icone nome="alerta" tamanho={14} />
      <span>
        <b>Modo demonstração.</b> A base de dados não está conectada: os nomes das creches são reais,
        mas as chances e os critérios confirmados são ilustrativos.
      </span>
    </p>
  )
}

/**
 * Faixa de chance como pastilha.
 *
 * Substituiu um medidor de três barras: barras crescentes sugerem medição
 * graduada, e o que temos é uma faixa. A pastilha carrega a informação no
 * texto — não depende de cor — e cabe igual na lista longa, no cartão de
 * detalhe e na sidebar.
 */
export function Faixa({ faixa, motivo }) {
  if (!faixa) return <span className="faixa-pill sem">{motivo || 'sem estimativa'}</span>
  return <span className={`faixa-pill ${faixa}`}>{ROTULO[faixa]}</span>
}

/**
 * Slot de chance. Mesmo lugar e mesma anatomia nos dois casos: a unidade
 * recomendada mostra a faixa, a que não passou pelo modelo mostra
 * "não estimada". A honestidade é conteúdo do componente, não um componente
 * diferente.
 */
export function Chance({ faixa, motivo }) {
  return (
    <span className="chance">
      <Faixa faixa={faixa} motivo={motivo} />
      <span className="sr">
        {faixa ? 'chance de a matrícula dar certo' : motivo || 'chance não calculada para esta unidade'}
      </span>
    </span>
  )
}

export const corDaFaixa = (f) => `var(--${COR[f]})`

export function Erro({ children }) {
  if (!children) return null
  return (
    <p className="erro" role="alert">
      <Icone nome="alerta" tamanho={14} />
      <span>{children}</span>
    </p>
  )
}

export function Carregando({ children }) {
  return (
    <div className="carregando" role="status">
      <span className="spin" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

const CAMINHOS = {
  voltar: <path d="M19 12H5M12 19l-7-7 7-7" />,
  casa: <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  alerta: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18.4A2 2 0 0 0 3.5 21.5h17a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  seta: <path d="M5 12h14M12 5l7 7-7 7" />,
  busca: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  pin: <><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></>,
  predio: <><path d="M3 21h18M5 21V9l7-5 7 5v12" /><path d="M10 21v-5h4v5" /></>,
  filtro: <path d="M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M11 16v4" />,
}

export function Icone({ nome, tamanho = 15, largura = 2.2 }) {
  return (
    <svg
      width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={largura} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flex: 'none' }}
    >
      {CAMINHOS[nome]}
    </svg>
  )
}
