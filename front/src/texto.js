// A base da SME grava os nomes em caixa alta ("CP CRECHE COMUNITÁRIA TIA ALICE").
// Em tela isso lê mal e parece grito. Normaliza preservando as siglas da rede.
const SIGLAS = new Set(['EDI', 'CP', 'CIEP', 'EM', 'CEI', 'CRE', 'SME', 'IV', 'III', 'II', 'I'])
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o'])

export function nomeUnidade(nome) {
  if (!nome) return ''
  // se já vem em caixa mista, o cadastro está bom — não mexe
  if (nome !== nome.toUpperCase()) return nome

  return nome
    .split(/\s+/)
    .map((p, i) => {
      const cru = p.replace(/[^A-ZÀ-Ú]/gi, '')
      if (SIGLAS.has(cru)) return p
      const baixa = p.toLocaleLowerCase('pt-BR')
      if (i > 0 && MINUSCULAS.has(baixa)) return baixa
      return baixa.replace(/^\p{L}/u, (c) => c.toLocaleUpperCase('pt-BR'))
    })
    .join(' ')
}
