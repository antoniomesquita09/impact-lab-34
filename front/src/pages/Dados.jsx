import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { AvisoDemo, Cabecalho, Carregando, Erro, Icone, Passos } from '../componentes'
import { guardarRespostas } from '../EditarRespostas'

/**
 * Formulário em etapas: uma pergunta por tela.
 *
 * A primeira etapa é a única com muita coisa junta, de propósito — é o momento
 * mais forte do produto: a família vê tudo o que a Prefeitura já sabe e que ela
 * não vai precisar responder. Depois vem uma pergunta de cada vez, e o bloco de
 * confirmados NÃO volta: ele é o argumento da abertura, não um painel fixo.
 *
 * O progresso mora em duas faixas no topo, atravessando a tela: a do processo
 * (Conta · Dados · Local · Creches) e a das perguntas, que lista cada uma pelo
 * nome, marca com um check o que já foi respondido e deixa voltar com um clique.
 * Embaixo delas a pergunta da vez usa a largura toda, com teto de leitura.
 *
 * O CSS vive aqui dentro para não disputar o styles.css com as outras sessões.
 *
 * As respostas ficam em memória e vão numa ÚNICA chamada ao
 * `POST /api/inscricao/respostas` no fim — nada de uma requisição por pergunta.
 */

const CSS = `
.wz { display: flex; flex-direction: column; gap: 12px; min-height: 100vh; justify-content: flex-start; }
.wz-topo {
  background: var(--surface); border: 1px solid rgba(16, 32, 58, .06);
  border-radius: var(--r-frame); box-shadow: var(--shadow-lg);
  padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 10px;
}
.wz-topo .rail-head { padding: 0; }
.wz-topo .steps { width: 100%; }

/* faixa do histórico: rola na horizontal em vez de quebrar em várias linhas —
   no pior caso (CPF fora dos cadastros) são 15 perguntas */
.wz-hist {
  display: flex; gap: 7px; overflow-x: auto; overscroll-behavior-x: contain;
  padding: 2px 2px 6px; scrollbar-width: thin;
}
.wz-chip {
  font: inherit; display: inline-flex; align-items: center; gap: 6px; flex: none;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink-2);
  border-radius: 999px; padding: 6px 12px 6px 8px; cursor: default; max-width: 270px;
}
.wz-chip[data-clicavel='sim'] { cursor: pointer; }
.wz-chip[data-clicavel='sim']:hover { background: var(--sunken); color: var(--ink); }
.wz-chip b {
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
  width: 19px; height: 19px; border-radius: 50%; flex: none;
  display: grid; place-items: center; background: var(--line-2); color: var(--ink-2);
}
.wz-chip span {
  font-size: 12px; line-height: 1.2; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.wz-chip.feita { border-color: #BFDDD3; background: #E9F4F0; color: #145446; }
.wz-chip.feita b { background: #1F6F5C; color: #fff; }
.wz-chip.agora { border-color: var(--ink); background: var(--ink); color: #fff; }
.wz-chip.agora b { background: rgba(255, 255, 255, .22); color: #fff; }

.wz-palco { display: flex; flex-direction: column; gap: 16px; flex: 1; }

@media (min-width: 1081px) {
  .wz { max-width: 1500px; margin: 0 auto; gap: 14px; }
  .wz-topo { flex-direction: row; align-items: center; gap: 24px; padding: 12px 20px; }
  .wz-topo .rail-head { flex: none; }
  .wz-topo .steps { flex: 1; }
  .wz-palco {
    background: var(--surface); border: 1px solid rgba(16, 32, 58, .06);
    border-radius: var(--r-frame); box-shadow: var(--shadow-lg);
    padding: clamp(28px, 3vw, 52px);
    align-items: center; justify-content: center; gap: 24px;
  }
  /* largura própria com teto: sem isto os cartões Sim/Não esticariam para os
     1.000px do painel e virariam dois outdoors */
  .wz-palco .etapa,
  .wz-palco > .erro,
  .wz-palco .passo-acoes { width: min(720px, 100%); }
  /* altura mínima estável: uma pergunta de uma linha e outra de três não podem
     mover o bloco de lugar, senão a troca de etapa fica saltando */
  .wz-palco .etapa { gap: 22px; min-height: 340px; justify-content: center; }
  .wz-palco .etapa .titulo h1 { font-size: clamp(28px, 2.7vw, 38px); }
  .wz-palco .etapa .lede { font-size: 15px; }
  .wz-palco .escolhas { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; max-width: 520px; }
  .wz-palco .escolha { min-height: 168px; }
  .wz-palco .escolha .ilustra { width: 54px; height: 54px; }
  .wz-palco .passo-acoes { margin-top: 0; }
  /* a abertura é longa: ali o bloco alinha ao topo em vez de centralizar */
  .wz-palco .etapa:has(.validadas) { min-height: 0; }
  .wz-palco .etapa .validadas { width: 100%; }
}

@media (min-width: 1800px) {
  .wz { max-width: 1680px; }
  .wz-palco { padding: 64px; }
}
`

/**
 * Rótulo do chip. Só tira o sujeito quando ele é redundante ("A criança..." em
 * todas), porque cortar "Os pais ou responsáveis" transformaria a pergunta em
 * "têm deficiência" — de quem? O texto inteiro fica no title e o CSS trunca.
 */
function rotuloCurto(texto) {
  const t = String(texto || '').replace(/\?\s*$/, '').trim()
  const sem = t.replace(/^(A crian\u00e7a|A fam\u00edlia da crian\u00e7a)\s+/i, '')
  // "A criança ou alguém do convívio..." vira "Ou alguém do convívio...", que
  // lê pior do que o original: nesse caso o sujeito fica
  if (!sem || sem === t || /^ou\s/i.test(sem)) return t
  return sem.charAt(0).toUpperCase() + sem.slice(1)
}

// ilustrações de linha, inline: nada de rede, nada de biblioteca
const ILUSTRACOES = {
  sim: (
    <>
      <circle cx="26" cy="26" r="19" />
      <path d="m18 26.5 5.5 5.5L34 21" />
    </>
  ),
  nao: (
    <>
      <circle cx="26" cy="26" r="19" />
      <path d="M20 20 32 32M32 20 20 32" />
    </>
  ),
  calendario: (
    <>
      <rect x="8" y="12" width="36" height="32" rx="4" />
      <path d="M8 22h36M18 8v8M34 8v8" />
      <path d="M18 31h5M29 31h5" />
    </>
  ),
  integral: (
    <>
      <circle cx="26" cy="26" r="9" />
      <path d="M26 6v5M26 41v5M6 26h5M41 26h5M12 12l3.5 3.5M36.5 36.5 40 40M40 12l-3.5 3.5M15.5 36.5 12 40" />
    </>
  ),
  parcial: (
    <>
      <path d="M34 30a13 13 0 0 1-15.5-18A14 14 0 1 0 36 32z" />
    </>
  ),
  escudo: (
    <>
      <path d="M26 6 10 13v12c0 10 7 17 16 21 9-4 16-11 16-21V13z" />
      <path d="m19 25 5 5 9-10" />
    </>
  ),
}

const Ilustra = ({ nome, tom = 'currentColor' }) => (
  <svg viewBox="0 0 52 52" fill="none" stroke={tom} strokeWidth="2.4"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ilustra">
    {ILUSTRACOES[nome]}
  </svg>
)

export default function Dados() {
  const navegar = useNavigate()
  const [dados, setDados] = useState(null)
  const [resp, setResp] = useState({})
  const [nasc, setNasc] = useState('')
  const [horario, setHorario] = useState('')
  const [etapa, setEtapa] = useState(0)
  const [saindo, setSaindo] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api('/api/inscricao/preparar').then(setDados).catch((x) => setErro(x.message))
  }, [])

  if (!dados) {
    return (
      <div className="pagina wz">
        <style>{CSS}</style>
        <div className="wz-topo">
          <Cabecalho voltar="/entrar" />
          <Passos atual="dados" />
        </div>
        <AvisoDemo />
        <main className="wz-palco">
          {erro ? <Erro>{erro}</Erro> : <Carregando>Consultando os cadastros da Prefeitura…</Carregando>}
        </main>
      </div>
    )
  }

  const naoVerificaveis = new Set(dados.nao_verificaveis || [])
  const validadas = dados.perguntas.filter((q) => q.validada)
  const pendentes = dados.perguntas.filter((q) => !q.validada)

  // etapa 0 é a abertura; as demais são um passo cada
  const passos = 2 + pendentes.length // nascimento, turno, e uma por pergunta
  const passoAtual = etapa // 1..passos
  const ultima = etapa === passos

  const podeAvancar =
    etapa === 0 ||
    (etapa === 1 && !!nasc) ||
    (etapa === 2 && !!horario) ||
    (etapa >= 3 && resp[pendentes[etapa - 3]?.id] !== undefined)

  // transição curta: não pode atrasar quem responde rápido
  function irPara(n) {
    const alvo = Math.max(0, Math.min(passos, n))
    setErro('')
    setSaindo(true)
    setTimeout(() => {
      setEtapa(alvo)
      setSaindo(false)
    }, 110)
  }
  const ir = (delta) => irPara(etapa + delta)

  // uma etapa está respondida quando tem valor; é isso que libera o clique no
  // histórico e o que desenha o check
  function respondida(n) {
    if (n === 1) return !!nasc
    if (n === 2) return !!horario
    const q = pendentes[n - 3]
    return !!q && resp[q.id] !== undefined
  }

  const etapasHist = Array.from({ length: passos }, (_, i) => {
    const n = i + 1
    const q = pendentes[n - 3]
    const texto = n === 1 ? 'Nascimento' : n === 2 ? 'Turno' : (q?.texto || `Pergunta ${n}`)
    return { n, texto, curto: n <= 2 ? texto : rotuloCurto(texto), feita: respondida(n) }
  })

  async function enviar() {
    setErro('')
    setEnviando(true)
    try {
      const respostas = {}
      for (const [id, v] of Object.entries(resp)) respostas[String(id)] = v
      await api('/api/inscricao/respostas', {
        respostas,
        nascimento_crianca: nasc,
        horario,
      })
      // nenhum endpoint devolve o que a família respondeu; esta é a única cópia,
      // e é dela que o modal de editar respostas parte
      guardarRespostas(respostas, nasc, horario)
      navegar('/inscricao/referencia')
    } catch (x) {
      setErro(x.message)
      setEnviando(false)
    }
  }

  const Escolha = ({ opcoes, valor, aoEscolher }) => (
    <div className="escolhas">
      {opcoes.map((o) => {
        const ativa = valor === o.valor
        return (
          <button
            key={String(o.valor)} type="button"
            className={`escolha${ativa ? ' on' : ''}`}
            aria-pressed={ativa}
            onClick={() => aoEscolher(o.valor)}
          >
            {ativa && <span className="marca"><Icone nome="check" tamanho={12} largura={3.5} /></span>}
            <Ilustra nome={o.ilustra} />
            <b>{o.rotulo}</b>
            {o.ajuda && <small>{o.ajuda}</small>}
          </button>
        )
      })}
    </div>
  )

  let conteudo
  if (etapa === 0) {
    conteudo = (
      <>
        <div className="titulo">
          {/* o selo só faz sentido se houver o que não responder: com o CPF fora
              dos cadastros a lista vem vazia e a tela se contradiria */}
          {validadas.length > 0 && (
            <span className="selo">
              <Icone nome="check" tamanho={12} largura={3.5} /> Nada disto você precisa responder
            </span>
          )}
          <h1>
            {validadas.length > 0
              ? 'A Prefeitura já confirmou o que sabe sobre você'
              : 'Vamos preencher a sua inscrição'}
          </h1>
          <p className="lede">
            {validadas.length > 0
              ? `Consultamos os cadastros e confirmamos ${validadas.length} ${validadas.length === 1 ? 'critério' : 'critérios'} por você, sem precisar pedir nada. Se algo estiver errado, procure o CRAS ou a unidade.`
              : 'Não encontramos seu CPF nos cadastros da Prefeitura, então desta vez você responde tudo à mão.'}
          </p>
        </div>

        {validadas.length > 0 && (
          <ul className="validadas">
            {validadas.map((q) => (
              <li key={q.id} className={q.valor ? 'sim' : 'nao'}>
                <span className="mk2">
                  {q.valor ? <Icone nome="check" tamanho={10} largura={3.5} /> : <span className="tracinho" />}
                </span>
                <span>
                  {q.texto}
                  <small>
                    {[q.fonte, q.orgao, q.referencia].filter(Boolean).join(' · ')}
                    {q.confianca === 'media' && ' · confiança média'}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="ajuda">
          Agora faltam {passos} respostas suas. Vamos uma de cada vez.
        </p>
      </>
    )
  } else if (etapa === 1) {
    conteudo = (
      <>
        <div className="titulo">
          <h1>Quando a criança nasceu?</h1>
          <p className="lede">A data define o grupamento — Berçário, Maternal I ou Maternal II.</p>
        </div>
        <div className="ilustra-topo"><Ilustra nome="calendario" tom="var(--accent)" /></div>
        <label className="field grande">
          <span>Data de nascimento da criança</span>
          <input type="date" value={nasc} onChange={(e) => setNasc(e.target.value)} required autoFocus />
        </label>
      </>
    )
  } else if (etapa === 2) {
    conteudo = (
      <>
        <div className="titulo">
          <h1>Qual turno você precisa?</h1>
          <p className="lede">O integral cobre o dia todo; o parcial, meio período.</p>
        </div>
        <Escolha
          valor={horario}
          aoEscolher={setHorario}
          opcoes={(dados.horarios || []).map((h) => ({
            valor: h,
            rotulo: h,
            ilustra: h === 'Integral' ? 'integral' : 'parcial',
            ajuda: h === 'Integral' ? 'o dia inteiro na creche' : 'manhã ou tarde',
          }))}
        />
      </>
    )
  } else {
    const q = pendentes[etapa - 3]
    const sensivel = naoVerificaveis.has(q.id)
    conteudo = (
      <>
        <div className="titulo">
          <h1>{q.texto}</h1>
          {sensivel ? (
            <p className="lede aviso-sensivel">
              <Ilustra nome="escudo" tom="var(--amber)" />
              Só você pode responder. Nenhum cadastro é consultado, e a unidade pode pedir comprovação.
            </p>
          ) : (
            <p className="lede">A unidade pode pedir comprovação depois.</p>
          )}
        </div>
        <Escolha
          valor={resp[q.id]}
          aoEscolher={(v) => setResp({ ...resp, [q.id]: v })}
          opcoes={[
            { valor: true, rotulo: 'Sim', ilustra: 'sim' },
            { valor: false, rotulo: 'Não', ilustra: 'nao' },
          ]}
        />
      </>
    )
  }

  return (
    <div className="pagina wz">
      <style>{CSS}</style>

      {/* Faixa 1: onde a família está no processo. Atravessa a tela em vez de
          morar numa coluna — o conteúdo abaixo usa a largura toda. */}
      <div className="wz-topo">
        <Cabecalho
          voltar={etapa === 0 ? '/entrar' : undefined}
        />
        <Passos atual="dados" />
      </div>

      <AvisoDemo />

      {/* Faixa 2: o progresso dentro do formulário. Cada pergunta pelo nome,
          com check no que já foi respondido, e clicável para voltar. */}
      {etapa > 0 && (
        <nav className="wz-hist" aria-label={`Perguntas: ${passoAtual} de ${passos}`}>
          {etapasHist.map((e) => {
            const agora = e.n === etapa
            const clicavel = !agora && (e.n < etapa || e.feita)
            return (
              <button
                key={e.n}
                type="button"
                title={e.texto}
                aria-current={agora ? 'step' : undefined}
                disabled={!clicavel}
                data-clicavel={clicavel ? 'sim' : 'nao'}
                className={`wz-chip${e.feita && !agora ? ' feita' : ''}${agora ? ' agora' : ''}`}
                onClick={clicavel ? () => irPara(e.n) : undefined}
                ref={agora ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
              >
                <b>{e.feita && !agora ? <Icone nome="check" tamanho={10} largura={4} /> : e.n}</b>
                <span>{e.curto}</span>
              </button>
            )
          })}
        </nav>
      )}

      <main className="wz-palco">
        <div className={`etapa${saindo ? ' saindo' : ''}`} key={etapa}>{conteudo}</div>

        <Erro>{erro}</Erro>

        <div className="passo-acoes">
          {etapa > 0 && (
            <button type="button" className="voltar" onClick={() => ir(-1)}>
              <Icone nome="voltar" tamanho={14} /> Voltar
            </button>
          )}
          {ultima ? (
            <button type="button" className="cta" disabled={!podeAvancar || enviando} onClick={enviar}>
              {enviando ? 'Salvando…' : 'Concluir e ver as creches'}
              <Icone nome="seta" largura={2.4} />
            </button>
          ) : (
            <button type="button" className="cta" disabled={!podeAvancar} onClick={() => ir(1)}>
              {etapa === 0 ? 'Começar' : 'Próxima'}
              <Icone nome="seta" largura={2.4} />
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
