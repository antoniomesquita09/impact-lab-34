// Distância entre dois pontos, em km.
//
// A API só devolve `km` para as 5 recomendadas; as outras 847 vêm sem. Como a
// referência da família vem na mesma resposta, o cálculo sai no cliente e evita
// uma ida ao back. Haversine com raio médio da Terra é mais que suficiente na
// escala do município (erro abaixo de 0,3%).
const R = 6371

const rad = (g) => (g * Math.PI) / 180

export function distanciaKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// A base mistura caixa e acentuação ("JACAREPAGUA", "REALENGO", "Vila Isabel"),
// e a família digita "jacarepaguá". Normaliza os dois lados antes de comparar.
export const normalizar = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
