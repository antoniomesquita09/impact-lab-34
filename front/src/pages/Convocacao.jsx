import { useEffect, useState } from 'react'
import { AvisoDemo, Cabecalho, Carregando, Erro, Icone } from '../componentes'
import { carregarInscricao } from '../inscricaoDados'

/**
 * Estado 3: o período de inscrição encerrou. Substitui o fluxo depois do login.
 *
 * ATENÇÃO — esta tela é de demonstração, e o limite é real:
 *
 * não existe endpoint de convocação nem de fechamento do período. O back não
 * sabe se a fila foi processada, se houve oferta de vaga, nem em que unidade.
 * O que é dado de verdade aqui é o que veio do `GET /api/inscricao`: as opções
 * que a família escolheu, na ordem, o grupamento e o turno. A oferta exibida no
 * sub-estado "convocada" usa a 1ª opção da própria inscrição — é a hipótese mais
 * provável e a única honesta com os dados que temos, não um resultado.
 *
 * Por isso: nenhuma data e nenhum prazo aparecem em tela, e aceitar ou recusar
 * não persiste em lugar nenhum. Os botões dizem o que aconteceria.
 *
 * As regras de contato e comparecimento descritas no texto são as do processo
 * atual da SME, não invenção: a unidade faz uma tentativa por dia durante três
 * dias, em horários diferentes, e a família tem três dias úteis para comparecer.
 */

const CSS = `
.tl { display: flex; flex-direction: column; gap: 16px; min-height: 100vh; justify-content: flex-start; }
.tl-app { display: flex; flex-direction: column; gap: 16px; width: 100%; }
.tl-esq, .tl-dir { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.tl-rodape { font-size: 12px; color: var(--ink-3); line-height: 1.5; padding: 0 2px; }
@media (min-width: 1081px) {
  .tl { justify-content: center; max-width: 1120px; margin: 0 auto; }
  .tl-app {
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .92fr);
    column-gap: clamp(28px, 3.2vw, 56px); row-gap: 20px; align-content: center;
  }
  .tl-app > .rail-head, .tl-app > .demo-bar { grid-column: 1; }
  .tl-app .icon-btn.vazio { display: none; }
  .tl-esq { grid-column: 1; align-self: center; }
  .tl-dir {
    grid-column: 2; background: var(--surface); border: 1px solid rgba(16, 32, 58, .06);
    border-radius: var(--r-frame); box-shadow: var(--shadow-lg); padding: clamp(18px, 1.8vw, 26px);
  }
  .tl-app > .tl-rodape { grid-column: 1; max-width: 52ch; }
  .tl .titulo h1 { font-size: clamp(28px, 2.6vw, 38px); }
  .tl .lede { max-width: 46ch; font-size: 15px; }
}
@media (min-width: 1800px) { .tl { max-width: 1280px; } }
.cv { display: flex; flex-direction: column; gap: 16px; }
.cv-sub {
  display: flex; gap: 7px; align-items: center; flex-wrap: wrap;
  border: 1px dashed rgba(138, 91, 18, .45); background: rgba(253, 243, 224, .55);
  border-radius: 12px; padding: 8px 10px;
}
.cv-sub span {
  font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: #8A5B12; margin-right: 2px;
}
.cv-sub button {
  font: inherit; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 5px 12px;
  border: 1px solid #C7B79A; background: #fff; color: #8A5B12; cursor: pointer;
}
.cv-sub button.on { background: #8A5B12; border-color: #8A5B12; color: #fff; }
.cv-oferta {
  border: 1px solid #1F6F5C; border-radius: 16px; padding: 16px; background: #fff;
  box-shadow: 0 0 0 3px rgba(31, 111, 92, .09); display: flex; flex-direction: column; gap: 11px;
}
.cv-oferta h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.02em; line-height: 1.25; }
.cv-oferta .cv-onde { margin: 0; font-size: 12.5px; color: #6A7789; }
.cv-linhas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: #EBEEF3; border: 1px solid #EBEEF3; border-radius: 11px; overflow: hidden; }
.cv-linhas > div { background: #fff; padding: 9px 11px; display: flex; flex-direction: column; gap: 2px; }
.cv-linhas dt { font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8A94A4; }
.cv-linhas dd { margin: 0; font-size: 14px; font-weight: 600; }
.cv-bts { display: flex; gap: 9px; flex-wrap: wrap; }
.cv-bt {
  font: inherit; font-size: 13.5px; font-weight: 600; border-radius: 999px; padding: 10px 20px;
  border: 1px solid #E2E7EE; background: #fff; color: #4A5567; cursor: pointer;
}
.cv-bt.forte { background: #1F6F5C; border-color: #1F6F5C; color: #fff; }
.cv-bt:disabled { opacity: .5; cursor: default; }
.cv-resposta {
  margin: 0; font-size: 12.5px; line-height: 1.55; color: #145446;
  background: #E2F1EC; border-radius: 11px; padding: 10px 12px;
}
.cv-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.cv-lista li { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; }
.cv-pos {
  width: 22px; height: 22px; border-radius: 50%; flex: none; display: grid; place-items: center;
  background: #F0F3F7; color: #4A5567; font-size: 10.5px; font-weight: 700;
}
.cv-pos.oferta { background: #1F6F5C; color: #fff; }
.cv-tit { margin: 0; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #8A94A4; }
.cv-nota { margin: 0; font-size: 11.5px; line-height: 1.55; color: #8A94A4; }
.cv-passos { margin: 0; padding-left: 17px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; line-height: 1.5; color: #4A5567; }
`

export default function Convocacao() {
  // sem endpoint de convocação, o sub-estado não vem de lugar nenhum: quem
  // demonstra escolhe, e o controle fica rotulado como demonstração
  const [sub, setSub] = useState('aguardando')
  const [resposta, setResposta] = useState(null)
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregarInscricao().then(setDados).catch((x) => setErro(x.message))
  }, [])

  const oferta = dados?.opcoes?.[0] || null

  return (
    <div className="pagina tl">
      <style>{CSS}</style>
      <div className="tl-app">
        <Cabecalho />
        <AvisoDemo />

        <div className="tl-esq">
          <div className="titulo">
            <h1>
              {sub === 'convocada'
                ? 'Você foi chamada para uma vaga'
                : 'O período de inscrição encerrou'}
            </h1>
            <p className="lede">
              {sub === 'convocada'
                ? 'A unidade abaixo tem vaga para a sua criança. Responda por aqui, e a unidade também vai tentar falar com você.'
                : 'As inscrições foram fechadas e a fila está sendo processada. Sua inscrição continua válida, na ordem de pontuação.'}
            </p>
          </div>

          <div className="cv-sub">
            <span>Modo demonstração</span>
            <button
              type="button" className={sub === 'aguardando' ? 'on' : ''}
              onClick={() => { setSub('aguardando'); setResposta(null) }}
            >
              Aguardando
            </button>
            <button
              type="button" className={sub === 'convocada' ? 'on' : ''}
              onClick={() => { setSub('convocada'); setResposta(null) }}
            >
              Convocada
            </button>
          </div>
        </div>

        <div className="tl-dir">
          {erro ? (
            <Erro>{erro}</Erro>
          ) : !dados ? (
            <Carregando>Buscando sua inscrição…</Carregando>
          ) : (
            <div className="cv">
              {sub === 'convocada' && oferta && (
                <div className="cv-oferta">
                  <p className="cv-tit">Vaga oferecida</p>
                  <h2>{oferta.nome}</h2>
                  {oferta.bairro && <p className="cv-onde">{oferta.bairro}</p>}
                  <dl className="cv-linhas">
                    <div><dt>Turma</dt><dd>{dados.estado.grupamento || '—'}</dd></div>
                    <div><dt>Turno</dt><dd>{dados.estado.horario || '—'}</dd></div>
                  </dl>

                  {resposta ? (
                    <p className="cv-resposta">
                      {resposta === 'aceita'
                        ? 'Se esta tela estivesse ligada ao sistema da SME, a vaga ficaria reservada no seu nome e a unidade seria avisada para receber você com os documentos da criança.'
                        : 'Se esta tela estivesse ligada ao sistema da SME, a vaga voltaria para a fila e seria oferecida à próxima criança. Você continuaria inscrita para as próximas chamadas.'}
                      {' '}Nada foi enviado: não existe endpoint de convocação neste protótipo.
                    </p>
                  ) : (
                    <div className="cv-bts">
                      <button type="button" className="cv-bt forte" onClick={() => setResposta('aceita')}>
                        Aceitar a vaga
                      </button>
                      <button type="button" className="cv-bt" onClick={() => setResposta('recusada')}>
                        Recusar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {sub === 'aguardando' && (
                <>
                  <p className="cv-tit">O que acontece a seguir</p>
                  <ol className="cv-passos">
                    <li>A fila é ordenada pela pontuação de cada inscrição.</li>
                    <li>Quando surge vaga numa das creches que você escolheu, a unidade entra em contato: uma tentativa por dia, durante três dias, em horários diferentes.</li>
                    <li>Depois do contato, você tem três dias úteis para comparecer à unidade.</li>
                  </ol>
                  <p className="cv-nota">
                    Mantenha o telefone do seu cadastro atualizado: não conseguir falar com a família
                    nas três tentativas retira a criança da lista.
                  </p>
                </>
              )}

              <div>
                <p className="cv-tit" style={{ marginBottom: 8 }}>
                  {sub === 'convocada' ? 'Suas escolhas' : 'O que você escolheu'}
                </p>
                {dados.opcoes.length === 0 ? (
                  <p className="cv-nota">Nenhuma creche escolhida.</p>
                ) : (
                  <ul className="cv-lista">
                    {dados.opcoes.map((u, i) => (
                      <li key={u.cod}>
                        <span className={`cv-pos${sub === 'convocada' && i === 0 ? ' oferta' : ''}`}>
                          {i + 1}ª
                        </span>
                        <span>
                          {u.nome}
                          {u.bairro && <span style={{ color: '#8A94A4' }}> · {u.bairro}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <dl className="stats">
                <div><dt>Pontuação</dt><dd>{dados.estado.score ?? '—'}</dd></div>
                <div><dt>Grupamento</dt><dd>{dados.estado.grupamento || '—'}</dd></div>
                <div><dt>Turno</dt><dd>{dados.estado.horario || '—'}</dd></div>
              </dl>
            </div>
          )}
        </div>

        <p className="tl-rodape">
          Protótipo do Claude Impact Lab. A convocação é uma demonstração: o sistema não tem
          endpoint de chamada de vaga, e a unidade mostrada é a sua 1ª opção, não um resultado.
        </p>
      </div>
    </div>
  )
}
