package prep

import (
	"math"
	"sort"
	"strings"
)

// OfertaItem é uma combinação grupamento×horário observada numa unidade.
type OfertaItem struct{ Grupamento, Horario string }

// Unidade é uma creche pronta para gravar: catálogo + taxa histórica + oferta.
type Unidade struct {
	Cod, Nome, Bairro, Tipo string
	CRE                     int
	Lat, Lon                float64
	TaxaRef                 *float64 // nil quando não houve inscrição no ano de referência
	NRef                    int
	Oferta                  []OfertaItem
}

// Modelo é a matriz de probabilidade base (posição da opção × faixa de distância)
// mais a mediana das taxas por unidade, usada para normalizar o fator da unidade.
type Modelo struct {
	PBase       [5][3]float64
	Mediana     float64
	CalibradoEm string
}

// HaversineKm devolve a distância em km entre duas coordenadas geográficas.
func HaversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	rad := func(d float64) float64 { return d * math.Pi / 180 }
	dlat, dlon := rad(lat2-lat1), rad(lon2-lon1)
	a := math.Sin(dlat/2)*math.Sin(dlat/2) +
		math.Cos(rad(lat1))*math.Cos(rad(lat2))*math.Sin(dlon/2)*math.Sin(dlon/2)
	return R * 2 * math.Asin(math.Sqrt(a))
}

// Faixa classifica a distância em perto (<2 km), média (2–5 km) e longe (≥5 km).
func Faixa(km float64) int {
	switch {
	case km < 2:
		return 0
	case km < 5:
		return 1
	default:
		return 2
	}
}

func normalizaBairro(s string) string { return strings.ToUpper(strings.TrimSpace(s)) }

type contador struct{ conf, tot int }

// minInscricoesTaxa é o piso para a taxa de uma unidade entrar na mediana:
// unidades com meia dúzia de inscrições produzem taxas de 0 ou 1 que distorcem.
const minInscricoesTaxa = 50

// Agregar lê os brutos uma única vez e devolve as unidades enriquecidas e o modelo calibrado.
//
// A distância usada na calibração é da unidade ao centróide do bairro declarado pelo
// responsável (média das coordenadas das unidades daquele bairro) — proxy grosseira,
// porque a base anonimizada não traz o endereço da família. Em produção a coordenada
// real vem do RMI ou do CEP.
func Agregar(qaPath, locPath string, anoRef int) ([]Unidade, Modelo, error) {
	coords, err := LerCoordenadas(locPath)
	if err != nil {
		return nil, Modelo{}, err
	}
	porChave := map[string]Coord{}
	for _, c := range coords {
		porChave[c.Cod] = c
	}

	// centróide de bairro a partir das unidades (proxy da posição da família)
	type soma struct {
		lat, lon float64
		n        int
	}
	somaBairro := map[string]*soma{}
	for _, c := range coords {
		b := normalizaBairro(c.Bairro)
		if b == "" {
			continue
		}
		s := somaBairro[b]
		if s == nil {
			s = &soma{}
			somaBairro[b] = s
		}
		s.lat += c.Lat
		s.lon += c.Lon
		s.n++
	}
	centroide := map[string][2]float64{}
	for b, s := range somaBairro {
		centroide[b] = [2]float64{s.lat / float64(s.n), s.lon / float64(s.n)}
	}

	taxaUnid := map[string]*contador{}         // ano de referência
	oferta := map[string]map[OfertaItem]bool{} // ano de referência
	vistas := map[string]bool{}                // qualquer ano, para o catálogo
	var matriz [5][3]contador                  // todos os anos, para a calibração

	err = LerOpcoes(qaPath, func(o Opcao) {
		vistas[o.Unidade] = true
		if o.Ano == anoRef {
			c := taxaUnid[o.Unidade]
			if c == nil {
				c = &contador{}
				taxaUnid[o.Unidade] = c
			}
			c.tot++
			if o.Situacao == "Confirmado" {
				c.conf++
			}
			if o.Grupamento != "" && o.Horario != "" {
				m := oferta[o.Unidade]
				if m == nil {
					m = map[OfertaItem]bool{}
					oferta[o.Unidade] = m
				}
				m[OfertaItem{o.Grupamento, o.Horario}] = true
			}
		}
		if o.Opcao < 1 || o.Opcao > 5 { // existem 11 linhas com opcao = 6
			return
		}
		cd, ok := porChave[ChaveUnidade(o.Unidade)]
		if !ok {
			return
		}
		cen, ok := centroide[normalizaBairro(o.Bairro)]
		if !ok { // bairro nulo (2,8% das linhas) ou sem unidade que o ancore
			return
		}
		f := Faixa(HaversineKm(cen[0], cen[1], cd.Lat, cd.Lon))
		cell := &matriz[o.Opcao-1][f]
		cell.tot++
		if o.Situacao == "Confirmado" {
			cell.conf++
		}
	})
	if err != nil {
		return nil, Modelo{}, err
	}

	var m Modelo
	m.CalibradoEm = "2021-2025"
	for pos := 0; pos < 5; pos++ {
		for f := 0; f < 3; f++ {
			if c := matriz[pos][f]; c.tot > 0 {
				m.PBase[pos][f] = float64(c.conf) / float64(c.tot)
			}
		}
	}

	var unidades []Unidade
	var taxas []float64
	for cod := range vistas {
		cd, ok := porChave[ChaveUnidade(cod)]
		if !ok {
			continue // sem coordenada: fica de fora do mapa
		}
		u := Unidade{Cod: cod, Nome: cd.Nome, Bairro: cd.Bairro, Tipo: cd.Tipo, CRE: cd.CRE, Lat: cd.Lat, Lon: cd.Lon}
		if c := taxaUnid[cod]; c != nil && c.tot > 0 {
			t := float64(c.conf) / float64(c.tot)
			u.TaxaRef, u.NRef = &t, c.tot
			if c.tot >= minInscricoesTaxa {
				taxas = append(taxas, t)
			}
		}
		for item := range oferta[cod] {
			u.Oferta = append(u.Oferta, item)
		}
		sort.Slice(u.Oferta, func(i, j int) bool {
			if u.Oferta[i].Grupamento != u.Oferta[j].Grupamento {
				return u.Oferta[i].Grupamento < u.Oferta[j].Grupamento
			}
			return u.Oferta[i].Horario < u.Oferta[j].Horario
		})
		unidades = append(unidades, u)
	}
	sort.Slice(unidades, func(i, j int) bool { return unidades[i].Cod < unidades[j].Cod })

	sort.Float64s(taxas)
	if n := len(taxas); n > 0 {
		if n%2 == 1 {
			m.Mediana = taxas[n/2]
		} else {
			m.Mediana = (taxas[n/2-1] + taxas[n/2]) / 2
		}
	}
	return unidades, m, nil
}
