import { DayPicker } from 'react-day-picker'
import { ptBR } from 'date-fns/locale'
import 'react-day-picker/style.css'
import { cn } from '../../lib/utils'

/**
 * Calendário (shadcn/ui `Calendar`, sobre react-day-picker v10) adaptado à
 * identidade visual do Matrícula Carioca.
 *
 * Três decisões que vêm do produto:
 *
 * 1. **Data futura é bloqueada.** A criança já nasceu; digitar 2027 num
 *    `<input type="date">` era possível e só quebrava lá no back.
 * 2. **Navegação por mês E por ano** (`captionLayout="dropdown"`). Um bebê de
 *    3 anos ficava a 36 cliques de seta do mês corrente. Com os dropdowns são
 *    dois toques.
 * 3. **Aberto, não em popover.** A etapa do wizard é uma pergunta só ("Quando a
 *    criança nasceu?"); esconder o calendário atrás de um botão acrescentaria
 *    um toque sem ganhar nada, e popover em celular é justamente onde mais dá
 *    errado.
 *
 * Estilo: o shadcn veste o Calendar com utilitários Tailwind que dependem do
 * preflight — que aqui está desligado de propósito (`src/tailwind.css`), para
 * não atropelar as ~1.600 linhas de `styles.css`. Então as classes viram CSS
 * próprio, escrito sobre as variáveis do react-day-picker e sobre os tokens do
 * projeto (`--accent`, `--ink`, `--line`, `--r-md`). O resultado é o mesmo
 * componente com a nossa cara; o que se perde é poder ajustá-lo por className
 * Tailwind, o que ninguém faz neste repositório.
 */

const CSS = `
/* as variáveis vão em \`.mc-cal .rdp-root\`, não em \`.mc-cal\`: o próprio
   react-day-picker as declara em \`.rdp-root\`, e uma declaração no elemento
   ganha de um valor herdado do pai por mais específico que ele seja */
.mc-cal .rdp-root {
  --rdp-accent-color: var(--accent);
  --rdp-accent-background-color: var(--accent-soft);
  --rdp-today-color: var(--accent);
  --rdp-day-height: 46px;
  --rdp-day-width: 46px;
  --rdp-day_button-height: 44px;
  --rdp-day_button-width: 44px;
  --rdp-day_button-border-radius: 12px;
  --rdp-day_button-border: 1px solid transparent;
  --rdp-selected-border: 0;
  --rdp-nav_button-height: 38px;
  --rdp-nav_button-width: 38px;
  --rdp-nav-height: 44px;
  --rdp-weekday-opacity: 1;
  --rdp-disabled-opacity: .3;
  --rdp-outside-opacity: .38;
  --rdp-dropdown-gap: 8px;
}

.mc-cal {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
  padding: 12px 14px 14px;
  color: var(--ink);
  font-family: var(--body);
  /* o mês inteiro cabe sem esticar; centralizado dentro do palco do wizard */
  width: max-content;
  max-width: 100%;
  margin-inline: auto;
}

/* topo: os dois dropdowns ocupam a faixa e as setas ficam nas pontas */
.mc-cal .rdp-month_caption { justify-content: center; }
.mc-cal .rdp-dropdowns { gap: 8px; }
.mc-cal .rdp-dropdown_root { position: relative; }
.mc-cal .rdp-caption_label {
  font-family: var(--display);
  font-size: 15px; font-weight: 600; letter-spacing: -.01em;
  border: 1px solid var(--line); border-radius: 999px;
  padding: 8px 30px 8px 14px; background: var(--sunken); color: var(--ink);
  white-space: nowrap;
}
.mc-cal .rdp-dropdown_root:hover .rdp-caption_label { background: var(--line-2); }
/* o <select> real é invisível por cima do rótulo: é ele que abre o menu nativo
   do sistema, que no celular é o seletor de rolagem — de graça e acessível */
.mc-cal .rdp-dropdown {
  font: inherit; font-size: 16px; /* < 16px faz o iOS dar zoom ao focar */
  cursor: pointer;
}
.mc-cal .rdp-dropdown:focus-visible ~ .rdp-caption_label {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
.mc-cal .rdp-chevron { fill: var(--ink-2); }
.mc-cal .rdp-dropdown_root .rdp-chevron {
  position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
  width: 11px; height: 11px; pointer-events: none;
}

.mc-cal .rdp-button_previous,
.mc-cal .rdp-button_next {
  border: 1px solid var(--line); border-radius: 50%;
  background: var(--surface); color: var(--ink-2); cursor: pointer;
}
.mc-cal .rdp-button_previous:hover:not(:disabled),
.mc-cal .rdp-button_next:hover:not(:disabled) { background: var(--sunken); }
.mc-cal .rdp-button_previous .rdp-chevron,
.mc-cal .rdp-button_next .rdp-chevron { width: 15px; height: 15px; }

.mc-cal .rdp-weekday {
  font-size: 11px; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; color: var(--ink-3);
  padding: 10px 0 6px;
}
.mc-cal .rdp-day_button {
  font: inherit; font-size: 14.5px; font-variant-numeric: tabular-nums;
  color: var(--ink); cursor: pointer;
}
.mc-cal .rdp-day_button:hover:not([disabled]) { background: var(--sunken); }
.mc-cal .rdp-today:not(.rdp-outside) .rdp-day_button {
  font-weight: 700; box-shadow: inset 0 0 0 1px var(--line);
}
.mc-cal .rdp-selected .rdp-day_button {
  background: var(--accent); color: #fff; font-weight: 700;
  border-color: var(--accent);
  box-shadow: 0 2px 10px -3px rgba(18, 98, 106, .8);
}
.mc-cal .rdp-disabled .rdp-day_button { cursor: default; }
.mc-cal .rdp-day_button:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

/* leitura da data escolhida, por extenso: confere sem decifrar o grid */
.mc-cal-eco {
  margin: 12px 0 0; padding-top: 11px; border-top: 1px solid var(--line-2);
  font-size: 13px; line-height: 1.4; color: var(--ink-2); text-align: center;
}
.mc-cal-eco b { color: var(--ink); font-weight: 600; }

@media (max-width: 400px) {
  .mc-cal .rdp-root {
    --rdp-day-height: 40px; --rdp-day-width: 40px;
    --rdp-day_button-height: 38px; --rdp-day_button-width: 38px;
  }
  .mc-cal { padding: 10px; }
}
`

const HOJE = () => {
  const d = new Date()
  d.setHours(12, 0, 0, 0) // meio-dia evita a virada de dia por fuso
  return d
}

/** "2025-06-10" -> Date local. Fora do formato, devolve undefined. */
export function deISO(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ''))
  if (!m) return undefined
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Date -> "2025-06-10". Sem `toISOString`, que converte para UTC e volta um
 *  dia em quem está a oeste de Greenwich — o Rio inteiro. */
export function paraISO(data) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`
}

/**
 * O Calendar cru, do shadcn: recebe e devolve `Date`.
 * Para o formulário, prefira `CampoData` abaixo.
 */
export function Calendar({
  className,
  selected,
  onSelect,
  anosParaTras = 8,
  ...props
}) {
  const hoje = HOJE()
  const inicio = new Date(hoje.getFullYear() - anosParaTras, 0, 1)
  return (
    <div className={cn('mc-cal', className)}>
      <style>{CSS}</style>
      <DayPicker
        mode="single"
        locale={ptBR}
        selected={selected}
        onSelect={onSelect}
        captionLayout="dropdown"
        startMonth={inicio}
        endMonth={hoje}
        defaultMonth={selected || hoje}
        disabled={{ after: hoje }}
        showOutsideDays
        fixedWeeks
        formatters={{
          // "janeiro" -> "Janeiro" (o pt-BR do date-fns devolve minúsculo)
          formatMonthDropdown: (mes) => {
            const t = mes.toLocaleDateString('pt-BR', { month: 'long' })
            return t.charAt(0).toUpperCase() + t.slice(1)
          },
        }}
        {...props}
      />
    </div>
  )
}

/**
 * Campo de data do formulário: entra e sai string ISO `"2025-06-10"`, que é
 * exatamente o que a API espera em `nascimento_crianca`. Substituição direta de
 * `<input type="date" value={nasc} onChange={e => setNasc(e.target.value)} />`.
 *
 * @param {string} valor      data em ISO, ou '' quando ainda não há escolha
 * @param {(iso: string) => void} aoMudar  recebe ISO; '' se a pessoa desmarcar
 * @param {boolean} [eco]     mostra a data por extenso embaixo (padrão: sim)
 */
export function CampoData({ valor, aoMudar, eco = true, ...props }) {
  const escolhida = deISO(valor)
  return (
    <Calendar
      selected={escolhida}
      onSelect={(d) => aoMudar(d ? paraISO(d) : '')}
      footer={
        eco ? (
          <p className="mc-cal-eco">
            {escolhida ? (
              <>
                Nascimento:{' '}
                <b>
                  {escolhida.toLocaleDateString('pt-BR', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </b>
              </>
            ) : (
              'Escolha o dia no calendário.'
            )}
          </p>
        ) : undefined
      }
      {...props}
    />
  )
}

export default CampoData
