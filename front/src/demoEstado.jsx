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
.demo-sel {
  border: 1px dashed rgba(138, 91, 18, .45); border-radius: 14px;
  padding: 11px 12px 12px; background: rgba(253, 243, 224, .55);
  display: flex; flex-direction: column; gap: 9px;
}
.demo-sel > legend, .demo-sel > .demo-sel-tit {
  display: flex; align-items: center; gap: 6px; padding: 0;
  font-size: 10px; font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; color: #8A5B12;
}
.demo-sel p { margin: 0; font-size: 11.5px; line-height: 1.45; color: #8A5B12; }
.demo-sel-ops { display: flex; flex-direction: column; gap: 6px; }
.demo-sel-op {
  display: flex; align-items: flex-start; gap: 9px; cursor: pointer;
  border: 1px solid transparent; border-radius: 10px; padding: 7px 9px;
  background: rgba(255, 255, 255, .6);
}
.demo-sel-op:hover { background: #fff; }
.demo-sel-op.on { border-color: #C79A3E; background: #fff; }
.demo-sel-op input { position: absolute; opacity: 0; pointer-events: none; }
.demo-sel-mk {
  width: 15px; height: 15px; border-radius: 50%; flex: none; margin-top: 1px;
  border: 1.5px solid #C7B79A; display: grid; place-items: center; background: #fff;
}
.demo-sel-op.on .demo-sel-mk { border-color: #8A5B12; }
.demo-sel-op.on .demo-sel-mk::after {
  content: ''; width: 7px; height: 7px; border-radius: 50%; background: #8A5B12;
}
.demo-sel-tx { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.demo-sel-tx b { font-size: 12.5px; font-weight: 600; color: #4A3A16; line-height: 1.25; }
.demo-sel-tx small { font-size: 11px; color: #8A7448; line-height: 1.3; }
`

/**
 * Rotulado como demonstração de propósito: quem assiste precisa entender que é
 * um atalho de apresentação, e não uma pergunta que o portal faria à família.
 */
export function SeletorDemo({ valor, aoMudar }) {
  return (
    <fieldset className="demo-sel">
      <style>{CSS}</style>
      <legend>Modo demonstração</legend>
      <p>
        Atalho para o júri: escolha a fase do processo que quer ver depois de entrar.
        Não faz parte do portal.
      </p>
      <div className="demo-sel-ops">
        {ESTADOS.map((e) => (
          <label key={e.valor} className={`demo-sel-op${valor === e.valor ? ' on' : ''}`}>
            <input
              type="radio" name="mc-demo-estado" value={e.valor}
              checked={valor === e.valor}
              onChange={() => aoMudar(e.valor)}
            />
            <span className="demo-sel-mk" aria-hidden="true" />
            <span className="demo-sel-tx">
              <b>{e.rotulo}</b>
              <small>{e.ajuda}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
