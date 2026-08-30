import { useState } from 'react'
import * as Radix from '@radix-ui/react-dialog'
import { cn } from '../../lib/utils'

/**
 * Diálogo modal (shadcn/ui `Dialog`, sobre `@radix-ui/react-dialog`) com a
 * identidade visual do Matrícula Carioca.
 *
 * Ele existe para tirar da mão o que o `EditarRespostas` implementava sozinho:
 * Esc, clique fora, ciclo de Tab preso na caixa, devolução do foco a quem
 * abriu, `role="dialog"`/`aria-modal`, `aria-labelledby`. O Radix faz tudo isso
 * — e mais três coisas que a versão artesanal não fazia: trava a rolagem do
 * fundo, esconde o resto da página dos leitores de tela (`aria-hidden` nos
 * irmãos) e trata o foco que entra pela barra do navegador.
 *
 * O que **não** se perde na troca: a estrutura de três faixas continua sendo
 * topo fixo · corpo rolável · **rodapé fixo**. O rodapé fixo não é estética —
 * a mensagem de erro morava no corpo rolável, caía abaixo da dobra, e a pessoa
 * clicava em "Salvar" sem ver por que nada acontecia. `DialogFooter` é o lugar
 * dela.
 *
 * Estilo em CSS próprio, e não nos utilitários Tailwind do shadcn, porque o
 * preflight está desligado de propósito neste projeto (`src/tailwind.css`) e
 * sem ele os utilitários do shadcn contam com resets que não existem aqui.
 */

const CSS = `
.mcd-fundo {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(16, 32, 58, .45); backdrop-filter: blur(2px);
  overscroll-behavior: contain;
}
.mcd-caixa {
  position: fixed; z-index: 61; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - 32px); max-width: 620px;
  max-height: min(88vh, 860px);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--surface); color: var(--ink);
  font-family: var(--body);
  border-radius: var(--r-frame);
  box-shadow: var(--shadow-lg);
}
.mcd-caixa:focus { outline: none; }

.mcd-topo {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 18px 18px 12px; border-bottom: 1px solid var(--line-2);
}
.mcd-topo h2 {
  font-family: var(--display);
  font-size: 18px; font-weight: 600; letter-spacing: -.02em; margin: 0;
}
.mcd-topo p { margin: 3px 0 0; font-size: 12.5px; color: var(--ink-2); line-height: 1.45; }
.mcd-x {
  margin-left: auto; width: 32px; height: 32px; border-radius: 50%; flex: none;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink-2);
  display: grid; place-items: center; cursor: pointer; font: inherit;
  font-size: 18px; line-height: 1;
}
.mcd-x:hover { background: var(--sunken); color: var(--ink); }

.mcd-corpo {
  padding: 14px 18px 18px; overflow: auto;
  display: flex; flex-direction: column; gap: 16px;
  overscroll-behavior: contain;
}
.mcd-pe {
  border-top: 1px solid var(--line-2); padding: 12px 18px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: var(--surface);
}

/* entrada e saída curtas: o suficiente para a caixa não "aparecer do nada",
   curtas o suficiente para não atrasar quem já sabe o que quer */
@media (prefers-reduced-motion: no-preference) {
  .mcd-fundo[data-state='open'] { animation: mcd-fade .16s ease-out; }
  .mcd-fundo[data-state='closed'] { animation: mcd-fade .12s ease-in reverse; }
  .mcd-caixa[data-state='open'] { animation: mcd-sobe .18s cubic-bezier(.2, .8, .3, 1); }
}
@keyframes mcd-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes mcd-sobe {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 10px)) scale(.985) }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1) }
}

/* no celular a caixa vira folha presa no rodapé: o polegar alcança os botões */
@media (max-width: 620px) {
  .mcd-caixa {
    top: auto; bottom: 0; left: 0; transform: none;
    width: 100%; max-width: none; max-height: 92vh;
    border-radius: var(--r-frame) var(--r-frame) 0 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    .mcd-caixa[data-state='open'] { animation: mcd-folha .2s cubic-bezier(.2, .8, .3, 1); }
  }
  @keyframes mcd-folha { from { transform: translateY(14px) } to { transform: none } }
}
`

/**
 * Último elemento focado fora de um modal. O Radix devolve o foco ao
 * `DialogTrigger` ao fechar, e os modais deste produto não têm trigger: são
 * abertos por estado, de qualquer tela. Sem isto o foco cai no `<body>` e quem
 * navega por teclado volta para o topo da página.
 *
 * Ler `document.activeElement` no render do conteúdo não serve: quando o React
 * chega a renderizar o portal, o foco já saiu do botão. Então guardamos o
 * último `focusin` de fora da caixa, que é exatamente quem abriu.
 */
let ultimoFoco = null
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (e) => {
      const alvo = e.target
      if (alvo && alvo.nodeType === 1 && !alvo.closest?.('.mcd-caixa')) ultimoFoco = alvo
    },
    true,
  )
}

export const Dialog = Radix.Root
export const DialogTrigger = Radix.Trigger
export const DialogClose = Radix.Close
export const DialogPortal = Radix.Portal

export function DialogOverlay({ className, ...props }) {
  return <Radix.Overlay className={cn('mcd-fundo', className)} {...props} />
}

export function DialogTitle({ className, ...props }) {
  return <Radix.Title className={className} {...props} />
}

export function DialogDescription({ className, ...props }) {
  return <Radix.Description className={className} {...props} />
}

export function DialogHeader({ titulo, descricao, comFechar = true, children }) {
  return (
    <div className="mcd-topo">
      <div>
        <DialogTitle>{titulo}</DialogTitle>
        {descricao ? <DialogDescription>{descricao}</DialogDescription> : null}
        {children}
      </div>
      {comFechar && (
        <DialogClose className="mcd-x" aria-label="Fechar">
          <span aria-hidden="true">×</span>
        </DialogClose>
      )}
    </div>
  )
}

/** Faixa do meio: é a única que rola. */
export function DialogBody({ className, ...props }) {
  return <div className={cn('mcd-corpo', className)} {...props} />
}

/** Faixa de baixo, fixa: botões e — importante — as mensagens de erro. */
export function DialogFooter({ className, ...props }) {
  return <div className={cn('mcd-pe', className)} {...props} />
}

/**
 * O conteúdo do modal. Já traz overlay e portal; os filhos são normalmente
 * `<DialogHeader/>`, `<DialogBody/>` e `<DialogFooter/>`.
 */
export function DialogContent({ className, children, onCloseAutoFocus, ...props }) {
  // quem abriu — congelado no primeiro render deste conteúdo
  const [abridor] = useState(
    () => ultimoFoco || (typeof document !== 'undefined' ? document.activeElement : null),
  )
  return (
    <DialogPortal>
      <style>{CSS}</style>
      <DialogOverlay />
      <Radix.Content
        className={cn('mcd-caixa', className)}
        onCloseAutoFocus={(e) => {
          if (onCloseAutoFocus) onCloseAutoFocus(e)
          if (e.defaultPrevented) return
          if (abridor && typeof abridor.focus === 'function' && abridor.isConnected) {
            e.preventDefault()
            abridor.focus()
          }
        }}
        {...props}
      >
        {children}
      </Radix.Content>
    </DialogPortal>
  )
}

/**
 * Atalho para o caso comum, que é o de todo modal deste produto: aberto por
 * estado, com título, corpo rolável e rodapé fixo.
 *
 * ```jsx
 * <Modal aberto={aberto} aoFechar={fechar} titulo="Editar respostas"
 *        descricao="A pontuação é recalculada pela Prefeitura ao salvar."
 *        rodape={<>…botões…</>}>
 *   …conteúdo…
 * </Modal>
 * ```
 *
 * `aoFechar` é chamado no Esc, no clique fora e no X — a mesma função que a
 * versão artesanal recebia em `aoFechar`.
 */
export function Modal({ aberto, aoFechar, titulo, descricao, rodape, children, ...props }) {
  return (
    <Dialog open={!!aberto} onOpenChange={(v) => { if (!v) aoFechar() }}>
      <DialogContent {...props}>
        <DialogHeader titulo={titulo} descricao={descricao} />
        <DialogBody>{children}</DialogBody>
        {rodape ? <DialogFooter>{rodape}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

export default Modal
