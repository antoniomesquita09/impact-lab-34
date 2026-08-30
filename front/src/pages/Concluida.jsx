import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { nomeUnidade } from '../texto'
import { AvisoDemo, Cabecalho, Carregando, Icone, Passos } from '../componentes'

export default function Concluida() {
  const [estado, setEstado] = useState(null)
  const [nomes, setNomes] = useState({})
  const [nomesProntos, setNomesProntos] = useState(false)

  useEffect(() => {
    api('/api/inscricao').then(setEstado).catch(() => setEstado({}))
    // o estado guarda só os códigos; busca os nomes para a família reconhecer
    api('/api/inscricao/recomendacoes?raio_km=5')
      .then((d) => {
        const m = {}
        for (const u of d.todas || []) m[u.cod] = u.nome
        for (const u of d.recomendadas || []) m[u.cod] = u.nome
        setNomes(m)
      })
      .catch(() => {})
      .finally(() => setNomesProntos(true))
  }, [])

  return (
    <div className="pagina estreita conclusao">
      <div className="app"><div className="rail">
        <Cabecalho />
        <Passos atual="creches" />
        <AvisoDemo />

        {/* Duas colunas no desktop: a confirmação e o que acontece a seguir de um
            lado, o resumo do que foi enviado do outro. No celular os dois blocos
            são só um flex column, na mesma ordem de sempre. */}
        <div className="conc-esq">
        <div className="titulo">
          <span className="selo">
            <Icone nome="check" tamanho={12} largura={3.5} /> Inscrição enviada
          </span>
          <h1>Pronto, está na fila</h1>
          <p className="lede">
            Guardamos suas opções na ordem escolhida. Quando surgir vaga, a unidade entra em contato
            pelo telefone do seu cadastro. Se não conseguirem falar com você em três tentativas,
            a criança sai da lista — mantenha o telefone atualizado.
          </p>
        </div>
        </div>

        <div className="conc-dir">
        {!estado ? (
          <Carregando>Buscando sua inscrição…</Carregando>
        ) : (
          <>
            {estado.opcoes?.length > 0 && (
              <ol className="resumo">
                {estado.opcoes.map((cod) => (
                  <li key={cod}>
                    {nomes[cod] ? (
                      nomeUnidade(nomes[cod])
                    ) : nomesProntos ? (
                      `Unidade ${cod}`
                    ) : (
                      <span className="esqueleto" aria-label="carregando o nome da creche" />
                    )}
                  </li>
                ))}
              </ol>
            )}
            <dl className="stats">
              <div><dt>Pontuação</dt><dd>{estado.score ?? '—'}</dd></div>
              <div><dt>Grupamento</dt><dd>{estado.grupamento || '—'}</dd></div>
              <div><dt>Turno</dt><dd>{estado.horario || '—'}</dd></div>
            </dl>
            {estado.ref_texto && (
              <p className="ajuda">Local de referência: {estado.ref_texto}</p>
            )}
          </>
        )}
        </div>

        <p className="rodape">
          Protótipo do Claude Impact Lab — nada foi enviado ao matricula.rio.{' '}
          <Link to="/inscricao/creches" className="link">Rever minhas opções</Link>
        </p>
      </div></div>
    </div>
  )
}
