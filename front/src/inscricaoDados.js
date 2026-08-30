import { api } from './api'
import { nomeUnidade } from './texto'

/**
 * Estado da inscrição + o nome e o bairro de cada unidade escolhida.
 *
 * O `GET /api/inscricao` guarda as opções só como códigos; nome e bairro vêm de
 * `todas[]` no `/api/inscricao/recomendacoes`. Essa segunda chamada depende de a
 * inscrição já ter local de referência, grupamento e turno — se faltar algum,
 * ela responde 400 e as opções ficam sem nome. É por isso que a falha é
 * engolida: a tela ainda tem o que mostrar, só que pelo código da unidade.
 */
export async function carregarInscricao() {
  const estado = await api('/api/inscricao')
  let unidades = {}
  try {
    const d = await api('/api/inscricao/recomendacoes?raio_km=5')
    for (const u of [...(d.todas || []), ...(d.recomendadas || [])]) {
      unidades[u.cod] = { cod: u.cod, nome: nomeUnidade(u.nome), bairro: u.bairro, km: u.km }
    }
  } catch {
    unidades = {}
  }
  const opcoes = (estado.opcoes || []).map(
    (cod) => unidades[cod] || { cod, nome: `Unidade ${cod}`, bairro: '', km: null },
  )
  return { estado, opcoes }
}
