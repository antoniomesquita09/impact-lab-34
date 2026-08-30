import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { AvisoDemo, Cabecalho, Carregando, Erro, Icone, Passos } from '../componentes'

export default function Dados() {
  const navegar = useNavigate()
  const [dados, setDados] = useState(null)
  const [resp, setResp] = useState({})
  const [nasc, setNasc] = useState('')
  const [horario, setHorario] = useState('Integral')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api('/api/inscricao/preparar')
      .then(setDados)
      .catch((x) => setErro(x.message))
  }, [])

  if (!dados) {
    return (
      <div className="pagina media">
        <div className="app"><div className="rail">
          <Cabecalho voltar="/entrar" />
          <Passos atual="dados" />
          <AvisoDemo />
          {erro ? <Erro>{erro}</Erro> : <Carregando>Consultando os cadastros da Prefeitura…</Carregando>}
        </div></div>
      </div>
    )
  }

  const naoVerificaveis = new Set(dados.nao_verificaveis || [])
  const validadas = dados.perguntas.filter((q) => q.validada)
  const pendentes = dados.perguntas.filter((q) => !q.validada)
  const pontosConfirmados = validadas.filter((q) => q.valor).reduce((s, q) => s + (q.pontos || 0), 0)

  async function enviar(e) {
    e.preventDefault()
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
      navegar('/inscricao/referencia')
    } catch (x) {
      setErro(x.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pagina media">
      <div className="app"><div className="rail">
        <Cabecalho voltar="/entrar" info="A unidade pode pedir comprovação do que você declarar." />
        <Passos atual="dados" />
        <AvisoDemo />

        <div className="titulo">
          <h1>Dados da criança e da família</h1>
          <p className="lede">
            {dados.encontrado === false
              ? 'Não encontramos seu CPF nos cadastros da Prefeitura, então precisamos que você responda tudo.'
              : 'A Prefeitura já confirmou o que consta nos cadastros. Você responde só o que falta.'}
          </p>
        </div>

        <form onSubmit={enviar} className="form">
          <label className="field">
            <span>Data de nascimento da criança</span>
            <input type="date" value={nasc} onChange={(e) => setNasc(e.target.value)} required />
          </label>

          <fieldset className="field">
            <legend>Turno</legend>
            <div className="opts">
              {dados.horarios.map((h) => (
                <button
                  key={h} type="button"
                  className={`opt${horario === h ? ' on' : ''}`}
                  aria-pressed={horario === h}
                  onClick={() => setHorario(h)}
                >
                  {h}
                </button>
              ))}
            </div>
          </fieldset>

          {validadas.length > 0 && (
            <section className="bloco">
              <h2>
                Já confirmado pela Prefeitura
                {pontosConfirmados > 0 && <span className="pontos">{pontosConfirmados} pts</span>}
              </h2>
              <p className="ajuda">
                Você não precisa responder estes itens. Se algo estiver errado, procure o CRAS ou a unidade.
              </p>
              <ul className="validadas">
                {validadas.map((q) => (
                  <li key={q.id} className={q.valor ? 'sim' : 'nao'}>
                    <span className="mk2">
                      {q.valor ? <Icone nome="check" tamanho={10} largura={3.5} /> : <span className="tracinho" />}
                    </span>
                    <span>
                      {q.texto}
                      {q.valor && q.pontos > 0 && <b> · {q.pontos} pts</b>}
                      <small>
                        {[q.fonte, q.orgao, q.referencia].filter(Boolean).join(' · ')}
                        {q.confianca === 'media' && ' · confiança média'}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bloco">
            <h2>Falta você responder</h2>
            <p className="ajuda">
              Estas respostas contam para a sua posição na fila. A unidade pode pedir comprovação.
            </p>
            <div className="pendentes">
            {pendentes.map((q) => {
              const sensivel = naoVerificaveis.has(q.id)
              return (
                <fieldset key={q.id} className={`ask${sensivel ? ' sensivel' : ''}`}>
                  <legend>
                    {q.texto}
                    {q.pontos > 0 && <span className="pontos leve">{q.pontos} pts</span>}
                  </legend>
                  <div className="opts">
                    <button
                      type="button" className={`opt${resp[q.id] === true ? ' on' : ''}`}
                      aria-pressed={resp[q.id] === true}
                      onClick={() => setResp({ ...resp, [q.id]: true })}
                    >
                      Sim
                    </button>
                    <button
                      type="button" className={`opt${resp[q.id] === false ? ' on' : ''}`}
                      aria-pressed={resp[q.id] === false}
                      onClick={() => setResp({ ...resp, [q.id]: false })}
                    >
                      Não
                    </button>
                  </div>
                  {sensivel && (
                    <span className="nota">
                      Só você pode responder. Nenhum cadastro é consultado.
                    </span>
                  )}
                </fieldset>
              )
            })}
            </div>
          </section>

          <Erro>{erro}</Erro>

          <button className="cta" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Continuar'}
            <Icone nome="seta" largura={2.4} />
          </button>
        </form>
      </div></div>
    </div>
  )
}
