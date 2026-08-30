import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { Carregando, Erro, Icone } from './componentes'

/**
 * Modal de "editar respostas", aberto de qualquer tela do fluxo.
 *
 * Duas regras que vêm do produto, não do código:
 *
 * 1. O que a Prefeitura confirmou por cadastro NÃO é editável. Aparece na lista,
 *    com o carimbo de proveniência, e com a explicação de que só o CRAS ou a
 *    unidade corrige. O back reforça isso: em `POST /api/inscricao/respostas` as
 *    prevalidadas sobrescrevem o que a família mandar.
 * 2. O score é do servidor. O modal manda o conjunto completo de respostas numa
 *    única requisição e mostra o `score` que voltar — nada é somado no cliente.
 *
 * De onde vêm as respostas atuais: nenhum endpoint devolve o que a família já
 * respondeu (o `/preparar` só devolve a régua e o que foi verificado, e o
 * `GET /api/inscricao` devolve score/grupamento/turno/opções). Então a tela de
 * Dados grava o que enviou em localStorage e o modal lê de lá. Se não achar,
 * as declaratórias aparecem sem resposta e a família responde aqui mesmo —
 * o pior caso é ela responder de novo, nunca perder ponto em silêncio.
 *
 * O CSS mora aqui dentro, de propósito: quatro sessões escrevem no mesmo
 * working tree hoje e um arquivo de estilo novo brigaria por cascata.
 */

const CSS = `
.er-fundo {
  position: fixed; inset: 0; z-index: 60; background: rgba(12, 22, 40, .45);
  backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center;
  padding: 16px; overscroll-behavior: contain;
}
.er-caixa {
  background: #fff; border-radius: 20px; width: 100%; max-width: 620px;
  max-height: min(88vh, 860px); display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(12, 22, 40, .28); overflow: hidden;
}
.er-topo {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 18px 18px 12px; border-bottom: 1px solid #EBEEF3;
}
.er-topo h2 { font-size: 18px; font-weight: 600; letter-spacing: -.02em; margin: 0; }
.er-topo p { margin: 3px 0 0; font-size: 12.5px; color: #6A7789; line-height: 1.45; }
.er-x {
  margin-left: auto; width: 32px; height: 32px; border-radius: 50%; flex: none;
  border: 1px solid #E2E7EE; background: #fff; color: #6A7789; display: grid; place-items: center;
  cursor: pointer;
}
.er-x:hover { background: #F2F5F9; color: #1B2637; }
.er-corpo { padding: 14px 18px 18px; overflow: auto; display: flex; flex-direction: column; gap: 16px; }
.er-secao { display: flex; flex-direction: column; gap: 8px; }
.er-secao h3 {
  margin: 0; font-size: 10px; font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; color: #8A94A4;
}
.er-nota { margin: 0; font-size: 12px; color: #6A7789; line-height: 1.5; }

.er-item { border: 1px solid #E6EAF1; border-radius: 13px; padding: 10px 12px; background: #fff; }
.er-item.mudou { border-color: #1F6F5C; box-shadow: 0 0 0 1px #1F6F5C inset; }
.er-linha {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  background: none; border: 0; padding: 0; cursor: pointer; color: inherit; font: inherit;
}
.er-tx { flex: 1; min-width: 0; font-size: 13.5px; line-height: 1.35; }
.er-chip {
  font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
  background: #F0F3F7; color: #6A7789; white-space: nowrap;
}
.er-chip.sim { background: #E2F1EC; color: #145446; }
.er-chip.nao { background: #F0F3F7; color: #6A7789; }
.er-chip.vazio { background: #FDF3E0; color: #8A5B12; }

.er-editor { display: flex; gap: 8px; margin-top: 10px; }
.er-op {
  flex: 1; border: 1px solid #E2E7EE; background: #fff; border-radius: 11px; padding: 9px;
  font: inherit; font-size: 13.5px; font-weight: 600; color: #1B2637; cursor: pointer;
}
.er-op:hover { background: #F5F8FB; }
.er-op.on { border-color: #1F6F5C; background: #E2F1EC; color: #145446; }
.er-aviso {
  display: flex; gap: 7px; align-items: flex-start; margin: 9px 0 0;
  font-size: 11.5px; line-height: 1.45; color: #8A5B12;
  background: #FDF3E0; border-radius: 9px; padding: 7px 9px;
}
.er-conf { display: flex; gap: 9px; align-items: flex-start; padding: 8px 2px; }
.er-conf .er-tx { font-size: 12.5px; color: #4A5567; }
.er-conf small { display: block; font-size: 10.5px; color: #8A94A4; margin-top: 1px; }
.er-cad {
  width: 17px; height: 17px; border-radius: 50%; flex: none; margin-top: 1px;
  display: grid; place-items: center; background: #E2F1EC; color: #145446;
}
.er-cad.nao { background: #F0F3F7; color: #98A2B1; }

.er-pe {
  border-top: 1px solid #EBEEF3; padding: 12px 18px; display: flex; align-items: center;
  gap: 10px; flex-wrap: wrap;
}
.er-score { font-size: 12.5px; color: #6A7789; margin: 0; }
.er-score b { font-size: 15px; color: #1B2637; font-variant-numeric: tabular-nums; }
.er-ganho { color: #145446; font-weight: 700; }
.er-perda { color: #9A3B2E; font-weight: 700; }
.er-bts { margin-left: auto; display: flex; gap: 8px; }
.er-bt {
  font: inherit; font-size: 13.5px; font-weight: 600; border-radius: 999px; padding: 9px 18px;
  border: 1px solid #E2E7EE; background: #fff; color: #4A5567; cursor: pointer;
}
.er-bt.forte { background: #16233A; border-color: #16233A; color: #fff; }
.er-bt:disabled { opacity: .5; cursor: default; }
.er-data { display: flex; flex-direction: column; gap: 5px; }
.er-data span { font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #8A94A4; }
.er-data input, .er-data select {
  font: inherit; font-size: 14px; padding: 9px 11px; border-radius: 11px;
  border: 1px solid #E2E7EE; background: #fff; color: #1B2637;
}
@media (max-width: 620px) {
  .er-fundo { padding: 0; align-items: flex-end; }
  .er-caixa { max-width: none; max-height: 92vh; border-radius: 20px 20px 0 0; }
}
`

const leJSON = (chave, padrao) => {
  try {
    const b = localStorage.getItem(chave)
    return b ? JSON.parse(b) : padrao
  } catch {
    return padrao
  }
}

/** Guardado pela tela de Dados; é a única cópia do que a família respondeu. */
export function guardarRespostas(respostas, nascimento, horario) {
  try {
    localStorage.setItem('respostas', JSON.stringify(respostas || {}))
    if (nascimento) localStorage.setItem('nascimento', nascimento)
    if (horario) localStorage.setItem('horario', horario)
  } catch {
    /* navegador sem storage: o modal cai no caso "sem resposta guardada" */
  }
}

export default function EditarRespostas({ aberto, aoFechar, aoSalvar }) {
  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState('')
  const [erro, setErro] = useState('')
  const [resp, setResp] = useState({})
  const [inicial, setInicial] = useState({})
  const [abertaId, setAbertaId] = useState(null)
  const [nasc, setNasc] = useState('')
  const [horario, setHorario] = useState('')
  const [scoreAntes, setScoreAntes] = useState(null)
  const [scoreDepois, setScoreDepois] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [semMudanca, setSemMudanca] = useState(false)

  const caixa = useRef(null)
  const focoAnterior = useRef(null)

  // devolve o foco a quem abriu o modal
  useEffect(() => {
    if (!aberto) return
    focoAnterior.current = document.activeElement
    return () => {
      const el = focoAnterior.current
      if (el && typeof el.focus === 'function') el.focus()
    }
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    setErro('')
    setErroCarga('')
    setSemMudanca(false)
    setScoreDepois(null)
    setAbertaId(null)
    setDados(null)

    const guardadas = leJSON('respostas', {})
    const normal = {}
    for (const [k, v] of Object.entries(guardadas)) normal[String(k)] = !!v
    setResp(normal)
    setInicial(normal)
    setNasc(localStorage.getItem('nascimento') || '')
    setHorario(localStorage.getItem('horario') || '')

    let vivo = true
    api('/api/inscricao/preparar')
      .then((d) => { if (vivo) setDados(d) })
      .catch((x) => { if (vivo) setErroCarga(x.message) })
    api('/api/inscricao')
      .then((e) => {
        if (!vivo) return
        setScoreAntes(typeof e.score === 'number' ? e.score : null)
        // o turno salvo é mais confiável do que o do localStorage
        if (e.horario) setHorario(e.horario)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [aberto])

  // Esc fecha; Tab circula dentro da caixa
  const teclado = useCallback((e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      aoFechar()
      return
    }
    if (e.key !== 'Tab' || !caixa.current) return
    const focaveis = caixa.current.querySelectorAll(
      'button:not([disabled]), input, select, [href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focaveis.length) return
    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primeiro.focus()
    }
  }, [aoFechar])

  // foco entra na caixa assim que ela existe
  useEffect(() => {
    if (!aberto || !caixa.current) return
    const alvo = caixa.current.querySelector('.er-x')
    if (alvo) alvo.focus()
  }, [aberto, dados])

  if (!aberto) return null

  const perguntas = dados?.perguntas || []
  const validadas = perguntas.filter((q) => q.validada)
  const editaveis = perguntas.filter((q) => !q.validada)
  const naoVerificaveis = new Set(dados?.nao_verificaveis || [])
  const horarios = dados?.horarios || ['Integral', 'Parcial']

  const mudadas = editaveis.filter((q) => {
    const antes = inicial[String(q.id)]
    const agora = resp[String(q.id)]
    return agora !== undefined && agora !== antes
  })
  const faltaData = !nasc
  const faltaTurno = !horario

  function responder(id, valor) {
    setSemMudanca(false)
    setScoreDepois(null)
    setResp((r) => ({ ...r, [String(id)]: valor }))
  }

  async function salvar() {
    setErro('')
    if (mudadas.length === 0) {
      setSemMudanca(true)
      return
    }
    if (faltaData || faltaTurno) {
      setErro('Antes de salvar, preencha a data de nascimento e o turno abaixo.')
      return
    }
    setSalvando(true)
    try {
      // conjunto COMPLETO numa única requisição: o back regrava tudo
      const respostas = {}
      for (const [k, v] of Object.entries(resp)) respostas[String(k)] = !!v
      const r = await api('/api/inscricao/respostas', {
        respostas,
        nascimento_crianca: nasc,
        horario,
      })
      guardarRespostas(respostas, nasc, horario)
      setInicial(respostas)
      setScoreDepois(typeof r.score === 'number' ? r.score : null)
      if (aoSalvar) aoSalvar(r)
    } catch (x) {
      setErro(
        x.status === 0 || !x.message
          ? 'Não conseguimos falar com o sistema agora. Suas mudanças continuam aqui — tente salvar de novo.'
          : `${x.message} Suas mudanças continuam aqui.`,
      )
    } finally {
      setSalvando(false)
    }
  }

  const delta = scoreDepois !== null && scoreAntes !== null ? scoreDepois - scoreAntes : null

  return (
    <div
      className="er-fundo"
      onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }}
      onKeyDown={teclado}
    >
      <style>{CSS}</style>
      <div className="er-caixa" ref={caixa} role="dialog" aria-modal="true" aria-labelledby="er-titulo">
        <div className="er-topo">
          <div>
            <h2 id="er-titulo">Editar respostas</h2>
            <p>Mude o que você declarou. A pontuação é recalculada pela Prefeitura ao salvar.</p>
          </div>
          <button type="button" className="er-x" aria-label="Fechar" onClick={aoFechar}>
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>×</span>
          </button>
        </div>

        <div className="er-corpo">
          {erroCarga ? (
            <Erro>{erroCarga}</Erro>
          ) : !dados ? (
            <Carregando>Buscando suas respostas…</Carregando>
          ) : (
            <>
              <section className="er-secao">
                <h3>Você declarou</h3>
                {editaveis.length === 0 && <p className="er-nota">Não há nada para editar.</p>}
                {editaveis.map((q) => {
                  const id = String(q.id)
                  const v = resp[id]
                  const sensivel = naoVerificaveis.has(q.id)
                  const mudou = v !== undefined && v !== inicial[id]
                  const expandida = abertaId === q.id
                  return (
                    <div key={q.id} className={`er-item${mudou ? ' mudou' : ''}`}>
                      <button
                        type="button"
                        className="er-linha"
                        aria-expanded={expandida}
                        onClick={() => setAbertaId(expandida ? null : q.id)}
                      >
                        <span className="er-tx">{q.texto}</span>
                        <span className={`er-chip ${v === true ? 'sim' : v === false ? 'nao' : 'vazio'}`}>
                          {v === true ? 'Sim' : v === false ? 'Não' : 'sem resposta'}
                        </span>
                      </button>

                      {expandida && (
                        <>
                          <div className="er-editor">
                            <button
                              type="button" className={`er-op${v === true ? ' on' : ''}`}
                              aria-pressed={v === true} onClick={() => responder(q.id, true)}
                            >
                              Sim
                            </button>
                            <button
                              type="button" className={`er-op${v === false ? ' on' : ''}`}
                              aria-pressed={v === false} onClick={() => responder(q.id, false)}
                            >
                              Não
                            </button>
                          </div>
                          <p className="er-aviso">
                            <Icone nome={sensivel ? 'alerta' : 'info'} tamanho={13} />
                            <span>
                              {sensivel
                                ? 'Só você pode responder. Nenhum cadastro é consultado, e a unidade pode pedir comprovação.'
                                : 'A unidade pode pedir comprovação depois.'}
                            </span>
                          </p>
                        </>
                      )}
                    </div>
                  )
                })}
              </section>

              {validadas.length > 0 && (
                <section className="er-secao">
                  <h3>A Prefeitura confirmou · não editável</h3>
                  {validadas.map((q) => (
                    <div key={q.id} className="er-conf">
                      <span className={`er-cad${q.valor ? '' : ' nao'}`}>
                        <Icone nome="check" tamanho={9} largura={4} />
                      </span>
                      <span className="er-tx">
                        {q.texto}
                        <small>
                          {[q.fonte, q.orgao, q.referencia].filter(Boolean).join(' · ')}
                          {q.confianca === 'media' && ' · confiança média'}
                        </small>
                      </span>
                    </div>
                  ))}
                  <p className="er-nota">
                    Isto vem dos cadastros e não muda por aqui. Se estiver errado, procure o CRAS ou a unidade.
                  </p>
                </section>
              )}

              {(faltaData || faltaTurno) && (
                <section className="er-secao">
                  <h3>Falta confirmar</h3>
                  <p className="er-nota">
                    Não encontramos estes dados neste navegador. Eles são obrigatórios para salvar.
                  </p>
                  {faltaData && (
                    <label className="er-data">
                      <span>Data de nascimento da criança</span>
                      <input type="date" value={nasc} onChange={(e) => setNasc(e.target.value)} />
                    </label>
                  )}
                  {faltaTurno && (
                    <label className="er-data">
                      <span>Turno</span>
                      <select value={horario} onChange={(e) => setHorario(e.target.value)}>
                        <option value="">Escolha…</option>
                        {horarios.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  )}
                </section>
              )}

            </>
          )}
        </div>

        {/* erro e aviso moram no rodapé fixo: no corpo rolável eles caíam abaixo
            da dobra e a pessoa clicava em Salvar sem ver por que nada acontecia */}
        <div className="er-pe">
          {(erro || semMudanca) && (
            <div style={{ width: '100%' }}>
              <Erro>{erro}</Erro>
              {semMudanca && !erro && <p className="er-nota">Nada mudou — não havia o que salvar.</p>}
            </div>
          )}
          <p className="er-score">
            {scoreDepois !== null ? (
              <>
                Pontuação: <b>{scoreAntes ?? '—'}</b> → <b>{scoreDepois}</b>{' '}
                {delta !== null && delta !== 0 && (
                  <span className={delta > 0 ? 'er-ganho' : 'er-perda'}>
                    {delta > 0 ? `você ganhou ${delta} ` : `você perdeu ${-delta} `}
                    {Math.abs(delta) === 1 ? 'ponto' : 'pontos'}
                  </span>
                )}
                {delta === 0 && <span>a pontuação não mudou</span>}
              </>
            ) : (
              <>
                Pontuação hoje: <b>{scoreAntes ?? '—'}</b>
                {mudadas.length > 0 && ` · ${mudadas.length} ${mudadas.length === 1 ? 'resposta alterada' : 'respostas alteradas'}`}
              </>
            )}
          </p>
          <div className="er-bts">
            <button type="button" className="er-bt" onClick={aoFechar}>
              {scoreDepois !== null ? 'Fechar' : 'Cancelar'}
            </button>
            <button
              type="button" className="er-bt forte"
              disabled={salvando || !dados}
              onClick={salvar}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
