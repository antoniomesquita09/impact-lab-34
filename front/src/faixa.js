// A chance de entrar não é exibida como número exato: os dados de 2021–2025
// não sustentam precisão de ponto percentual. A tela mostra faixa.
//
// ATENÇÃO: os cortes vivem aqui provisoriamente. O lugar certo deles é o Go
// (`back/recomenda`), junto da fórmula que produz o `p`, para que exista uma
// definição só, testada e auditável. Quando a API passar a devolver `faixa`,
// apague `deFaixa` e leia o campo direto — `ROTULO` e `COR` continuam válidos.
const CORTE_ALTA = 45
const CORTE_MEDIA = 25

export const ROTULO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
export const COR = { alta: 'accent', media: 'amber', baixa: 'alert' }

export function deFaixa(sugestao) {
  if (sugestao?.faixa) return sugestao.faixa // se o back passar a mandar, ele manda
  const p = sugestao?.p_pct ?? 0
  if (p >= CORTE_ALTA) return 'alta'
  if (p >= CORTE_MEDIA) return 'media'
  return 'baixa'
}

export const km = (v) =>
  typeof v === 'number' ? `${v.toFixed(1).replace('.', ',')} km` : ''
