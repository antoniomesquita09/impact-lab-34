import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AvisoDemo, Cabecalho, Carregando, Erro, Icone } from '../componentes'
import { carregarInscricao } from '../inscricaoDados'

/**
 * Estado 2: a família já enviou a inscrição e o período ainda está aberto.
 *
 * Substitui o fluxo depois do login. Duas coisas importam aqui: ver o que foi
 * escolhido, na ordem, e ter uma saída.
 *
 * A saída é trocar o endereço de referência, não refazer as perguntas. As
 * respostas dos critérios não mudam de um dia para o outro — o que muda é onde
 * a família mora ou de onde vai levar a criança, e é isso que reordena a lista
 * de creches viáveis. Por isso o botão leva à tela de referência, e de lá o
 * fluxo normal segue para a de creches.
 *
 * Nada nesta tela afirma prazo: não existe endpoint de calendário do processo.
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
.env { display: flex; flex-direction: column; gap: 18px; }
.env-cols { display: flex; flex-direction: column; gap: 18px; }
.env-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.env-lista li {
  display: flex; align-items: flex-start; gap: 11px;
  border: 1px solid #E6EAF1; border-radius: 13px; padding: 11px 13px; background: #fff;
}
.env-pos {
  width: 24px; height: 24px; border-radius: 50%; flex: none; display: grid; place-items: center;
  background: #16233A; color: #fff; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.env-nome { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.env-nome b { font-size: 13.5px; font-weight: 600; line-height: 1.3; }
.env-nome small { font-size: 11.5px; color: #6A7789; }
.env-acao {
  border: 1px solid #E6EAF1; border-radius: 16px; padding: 15px 16px; background: var(--sunken, #F5F8FB);
  display: flex; flex-direction: column; gap: 10px; align-items: flex-start;
}
.env-acao h2 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
.env-acao p { margin: 0; font-size: 12.5px; line-height: 1.5; color: #4A5567; }
.env-bt {
  font: inherit; font-size: 13.5px; font-weight: 600; border-radius: 999px; padding: 10px 18px;
  border: 0; background: #16233A; color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
}
.env-bt:hover { background: #24334F; }
.env-nota { margin: 0; font-size: 11.5px; line-height: 1.5; color: #8A94A4; }
.env-tit { margin: 0; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #8A94A4; }
`

export default function InscricaoEnviada() {
  const navegar = useNavigate()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregarInscricao().then(setDados).catch((x) => setErro(x.message))
  }, [])

  return (
    <div className="pagina tl">
      <style>{CSS}</style>
      <div className="tl-app">
        <Cabecalho />
        <AvisoDemo />

        <div className="tl-esq">
          <div className="titulo">
            <span className="selo">
              <Icone nome="check" tamanho={12} largura={3.5} /> Inscrição recebida
            </span>
            <h1>Sua inscrição foi recebida</h1>
            <p className="lede">
              O período de inscrição ainda está aberto. Enquanto estiver, você pode rever suas
              escolhas — as respostas que você deu continuam valendo.
            </p>
          </div>
        </div>

        <div className="tl-dir">
          {erro ? (
            <Erro>{erro}</Erro>
          ) : !dados ? (
            <Carregando>Buscando sua inscrição…</Carregando>
          ) : (
            <div className="env-cols">
                <div className="env">
                  <p className="env-tit">Suas escolhas, na ordem</p>
                  {dados.opcoes.length === 0 ? (
                    <p className="env-nota">Nenhuma creche escolhida ainda.</p>
                  ) : (
                    <ol className="env-lista">
                      {dados.opcoes.map((u, i) => (
                        <li key={u.cod}>
                          <span className="env-pos">{i + 1}ª</span>
                          <span className="env-nome">
                            <b>{u.nome}</b>
                            <small>
                              {[u.bairro, u.km != null ? `${u.km.toFixed(1)} km da referência` : '']
                                .filter(Boolean).join(' · ')}
                            </small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  <dl className="stats">
                    <div><dt>Grupamento</dt><dd>{dados.estado.grupamento || '—'}</dd></div>
                    <div><dt>Turno</dt><dd>{dados.estado.horario || '—'}</dd></div>
                  </dl>
                  {dados.estado.ref_texto && (
                    <p className="env-nota">Endereço de referência: {dados.estado.ref_texto}</p>
                  )}
                </div>

                <div className="env-acao">
                  <h2>Mudou de endereço?</h2>
                  <p>
                    É o endereço de referência que define quais creches ficam perto e em que ordem
                    elas aparecem. Se ele mudou, vale refazer a escolha: você marca o novo ponto e
                    escolhe as creches de novo. Suas respostas continuam as mesmas.
                  </p>
                  <button type="button" className="env-bt" onClick={() => navegar('/inscricao/referencia')}>
                    Trocar o endereço de referência
                    <Icone nome="seta" largura={2.4} />
                  </button>
                  <p className="env-nota">
                    A inscrição só é substituída quando você confirmar a nova lista de creches.
                  </p>
                </div>
            </div>
          )}
        </div>

        <p className="tl-rodape">
          Protótipo do Claude Impact Lab — nada foi enviado ao matricula.rio.
        </p>
      </div>
    </div>
  )
}
