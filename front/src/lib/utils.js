import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** `cn` do shadcn: junta condicionais (clsx) e resolve conflitos de utilitário
 *  Tailwind (tailwind-merge). Os componentes deste projeto são estilizados em
 *  CSS puro, mas o helper fica aqui porque é a assinatura que todo componente
 *  copiado do shadcn espera. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
