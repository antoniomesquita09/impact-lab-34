import { useState } from 'react'
import { Icone, Medidor } from './componentes'
import { km as fmtKm, ROTULO } from './faixa'

/**
 * Sidebar das creches escolhidas, na ordem de preferência.
 *
 * A ordem é a informação: na base de 2021–2025 a 1ª opção entra mais de seis
 * vezes mais que a 5ª. Por isso o número vem grande e a lista é reordenável.
 *
 * Sobre a chance: a FAIXA aqui é a mesma da lista da esquerda — a chance
 * própria da creche — e não muda quando a pessoa reordena. Uma creche "Alta" é
 * "Alta" nos dois lugares, sempre; duas metades da tela discordando sobre a
 * mesma unidade seria defeito, não informação.
 *
 * O efeito da posição continua visível, mas como número explícito ao lado da
 * ordem ("2ª opção · 37% nesta posição"). Um número não compete com a faixa;
 * outro rótulo qualitativo competiria.
 */
export default function MinhasOpcoes({ itens, aoMover, aoRemover, pctNaPosicao }) {
  const [arrastando, setArrastando] = useState(null)
  const [alvo, setAlvo] = useState(null)

  if (!itens.length) return null

  function soltar(destino) {
    if (arrastando !== null && arrastando !== destino) aoMover(arrastando, destino)
    setArrastando(null)
    setAlvo(null)
  }

  return (
    <aside className="opcoes" aria-label="Minhas opções, na ordem de preferência">
      <div className="opcoes-topo">
        <h2>Minhas opções</h2>
        <span className="conta">{itens.length} de 5</span>
      </div>
      <p className="opcoes-ajuda">
        A ordem conta muito: nos últimos cinco processos, a <b>1ª opção</b> entrou mais de seis
        vezes mais que a 5ª. Arraste para reordenar ou use as setas.
      </p>

      <ol className="opcoes-lista">
        {itens.map((c, i) => {
          const pct = pctNaPosicao ? pctNaPosicao(c, i) : null
          return (
            <li
              key={c.cod}
              className={`opcao${arrastando === i ? ' arrastando' : ''}${alvo === i ? ' alvo' : ''}`}
              draggable
              onDragStart={() => setArrastando(i)}
              onDragOver={(e) => { e.preventDefault(); setAlvo(i) }}
              onDragLeave={() => setAlvo((a) => (a === i ? null : a))}
              onDrop={(e) => { e.preventDefault(); soltar(i) }}
              onDragEnd={() => { setArrastando(null); setAlvo(null) }}
            >
              <span className="ordem" aria-hidden="true">{i + 1}</span>

              <span className="corpo">
                <span className="nome">{c.nome}</span>
                <span className="meta">{c.bairro} · {fmtKm(c.km)}</span>
                <span className="linha-chance">
                  {c.faixa && (
                    <>
                      <Medidor faixa={c.faixa} />
                      <b className={c.faixa}>{ROTULO[c.faixa]}</b>
                    </>
                  )}
                  {pct != null && (
                    <span className="pos">{i + 1}ª opção · <b>{pct}%</b> nesta posição</span>
                  )}
                </span>
              </span>

              {/* setas: cobrem toque, teclado e leitor de tela pelo mesmo caminho */}
              <span className="acoes">
                <button
                  type="button" className="mini" disabled={i === 0}
                  aria-label={`Subir ${c.nome} para a ${i}ª opção`}
                  onClick={() => aoMover(i, i - 1)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>
                </button>
                <button
                  type="button" className="mini" disabled={i === itens.length - 1}
                  aria-label={`Descer ${c.nome} para a ${i + 2}ª opção`}
                  onClick={() => aoMover(i, i + 1)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <button
                  type="button" className="mini remover"
                  aria-label={`Tirar ${c.nome} das minhas opções`}
                  onClick={() => aoRemover(c.cod)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </span>
            </li>
          )
        })}
      </ol>

      {itens.length < 5 && (
        <p className="opcoes-ajuda leve">
          <Icone nome="info" tamanho={13} />
          Você pode escolher até {5 - itens.length} creche{5 - itens.length > 1 ? 's' : ''} a mais.
        </p>
      )}
    </aside>
  )
}
