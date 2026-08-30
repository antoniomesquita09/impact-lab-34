/**
 * Atalho de apresentação: em que fase do processo a família está.
 *
 * O produto real descobriria isto pelo estado da inscrição e pelo calendário do
 * processo, que são do back. Nada disso existe hoje — não há endpoint de
 * fechamento de período nem de convocação — então quem escolhe é quem demonstra,
 * na tela de Entrar, e a escolha fica aqui. Por isso a chave é prefixada com
 * `mc.demo.`: é para não se confundir com estado de verdade.
 *
 * Quem lê e decide a rota é o App; esta tela e este arquivo só guardam a escolha.
 */

export const CHAVE_ESTADO = 'mc.demo.estado'

export const ESTADOS = [
  {
    valor: 'novo',
    rotulo: 'Ainda não me inscrevi',
    ajuda: 'o fluxo completo, do começo',
  },
  {
    valor: 'inscrito',
    rotulo: 'Já enviei a inscrição',
    ajuda: 'período aberto, dá para trocar o endereço',
  },
  {
    valor: 'encerrado',
    rotulo: 'O período encerrou',
    ajuda: 'esperando na fila ou convocada',
  },
]

const VALIDOS = new Set(ESTADOS.map((e) => e.valor))

/** Ausente ou desconhecido equivale a 'novo'. */
export function lerEstadoDemo() {
  try {
    const v = localStorage.getItem(CHAVE_ESTADO)
    return VALIDOS.has(v) ? v : 'novo'
  } catch {
    return 'novo'
  }
}

export function gravarEstadoDemo(valor) {
  try {
    localStorage.setItem(CHAVE_ESTADO, VALIDOS.has(valor) ? valor : 'novo')
  } catch {
    /* navegador sem storage: o app segue no fluxo normal */
  }
}

const CSS = `
/* Discreto de propósito: nota de rodapé, não painel. Quem apresenta precisa
   achar rápido; quem assiste não pode confundir com parte do portal. Por isso
   fica no canto, em cor secundária, mas com alvo de clique de tamanho normal. */
.demo-sel {
  border: 0; padding: 0; margin: 0; min-width: 0;
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
}
.demo-sel > span { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.demo-sel select {
  font: inherit; font-size: 11.5px; color: var(--ink-3);
  background: none; border: 0; border-bottom: 1px dotted var(--line);
  padding: 3px 2px; cursor: pointer; max-width: 100%;
}
.demo-sel select:hover, .demo-sel select:focus-visible { color: var(--ink-2); border-bottom-color: var(--ink-3); }

/* no desktop sai do fluxo e vai para o canto inferior; no celular fica no
   fluxo, no fim da página, para não cobrir o botão de entrar */
@media (min-width: 1081px) {
  .demo-sel {
    position: fixed; right: 14px; bottom: 10px; z-index: 5; flex-wrap: nowrap;
    background: rgba(255, 255, 255, .82); border-radius: 8px; padding: 4px 9px;
    backdrop-filter: blur(3px);
  }
}
`

/**
 * Nomeado, mas discreto: quem vai apresentar precisa achar rápido e saber qual
 * estado está ativo; quem assiste não pode confundir com parte do portal nem
 * ter a atenção puxada para cá. Daí o canto inferior, a cor secundária e o
 * tamanho de nota de rodapé — com alvo de clique normal, não minúsculo.
 */
export function SeletorDemo({ valor, aoMudar }) {
  return (
    /* label em vez de fieldset/legend: o legend é sempre bloco próprio e
       quebraria a linha, e no canto isso vira duas linhas em vez de uma */
    <label className="demo-sel">
      <style>{CSS}</style>
      <span>Modo demonstração:</span>
      <select
        value={valor}
        aria-label="Modo demonstração: fase do processo a ver depois de entrar"
        onChange={(e) => aoMudar(e.target.value)}
      >
        {ESTADOS.map((e) => (
          <option key={e.valor} value={e.valor}>{e.rotulo}</option>
        ))}
      </select>
    </label>
  )
}
