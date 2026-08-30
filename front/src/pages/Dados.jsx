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
 * não vai precisar responder. Depois vem uma pergunta de cada vez.
 *
 * As respostas ficam em memória e vão numa ÚNICA chamada ao
 * `POST /api/inscricao/respostas` no fim — nada de uma requisição por pergunta.
 */

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
      <div className="pagina wizard">
        <aside className="contexto">
          <Cabecalho voltar="/entrar" />
          <Passos atual="dados" />
          <AvisoDemo />
        </aside>
        <main className="palco">
          {erro ? <Erro>{erro}</Erro> : <Carregando>Consultando os cadastros da Prefeitura…</Carregando>}
        </main>
      </div>
    )
  }

  const naoVerificaveis = new Set(dados.nao_verificaveis || [])
  const validadas = dados.perguntas.filter((q) => q.validada)
  const pendentes = dados.perguntas.filter((q) => !q.validada)
  const pontosConfirmados = validadas.filter((q) => q.valor).reduce((s, q) => s + (q.pontos || 0), 0)

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
  function ir(delta) {
    setErro('')
    setSaindo(true)
    setTimeout(() => {
      setEtapa((e) => Math.max(0, Math.min(passos, e + delta)))
      setSaindo(false)
    }, 110)
  }

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
              ? `Consultamos os cadastros e confirmamos ${validadas.length} ${validadas.length === 1 ? 'critério' : 'critérios'} por você${pontosConfirmados > 0 ? `, que já valem ${pontosConfirmados} pontos` : ''}. Se algo estiver errado, procure o CRAS ou a unidade.`
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
    <div className="pagina wizard">
      {/* Coluna de contexto: persiste ao longo do wizard. O "a Prefeitura já
          sabe N coisas por você" é o argumento mais forte da tela e sumia assim
          que a pessoa entrava nas perguntas. */}
      <aside className="contexto">
        <Cabecalho voltar={etapa === 0 ? '/entrar' : undefined} info="A unidade pode pedir comprovação do que você declarar." />
        <Passos atual="dados" />
        <AvisoDemo />

        {etapa > 0 && (
          <div className="progresso">
            <div className="barra"><i style={{ width: `${(passoAtual / passos) * 100}%` }} /></div>
            <span>{passoAtual} de {passos}</span>
          </div>
        )}

        {etapa > 0 && validadas.length > 0 && (
          <section className="ja-sabe">
            <h2>
              A Prefeitura já confirmou
              {pontosConfirmados > 0 && <span className="pontos">{pontosConfirmados} pts</span>}
            </h2>
            <ul className="validadas compacta">
              {validadas.map((q) => (
                <li key={q.id} className={q.valor ? 'sim' : 'nao'}>
                  <span className="mk2">
                    {q.valor ? <Icone nome="check" tamanho={9} largura={3.5} /> : <span className="tracinho" />}
                  </span>
                  <span>{q.texto}<small>{q.fonte}</small></span>
                </li>
              ))}
            </ul>
            <p className="ajuda">Você não responde nada disto. Se algo estiver errado, procure o CRAS ou a unidade.</p>
          </section>
        )}
      </aside>

      <main className="palco">
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
