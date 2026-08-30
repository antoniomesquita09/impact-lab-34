package recomenda

import (
	"context"
	"math"
	"sort"
	"strconv"

	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Candidata struct {
	Cod, Nome, Bairro string
	Lat, Lon, Km      float64
	TaxaRef           *float64
	NRef              int
}

type Sugestao struct {
	Cod    string  `json:"cod"`
	Nome   string  `json:"nome"`
	Bairro string  `json:"bairro"`
	Lat    float64 `json:"lat"`
	Lon    float64 `json:"lon"`
	Km     float64 `json:"km"`
	P      float64 `json:"p"`
	PPct   int     `json:"p_pct"`
	// PPorPosicao traz a chance em cada uma das 5 posições da lista. p_pct é a
	// da 1ª — bom para comparar unidades entre si, errado para uma tela onde a
	// família reordena as opções e a posição muda.
	PPorPosicao [5]int  `json:"p_por_posicao"`
	Fator       float64 `json:"fator"`
	Motivo      string  `json:"motivo"`
}

// amostraMinima: abaixo disso a taxa histórica da unidade é ruído, e o fator vira 1.
const amostraMinima = 20

// Fator ajusta a probabilidade pelo histórico da unidade, limitado a [0,5; 1,6]
// para que nenhuma unidade isolada domine ou zere a recomendação.
func Fator(taxaRef *float64, nRef int, mediana float64) float64 {
	if taxaRef == nil || nRef < amostraMinima || mediana <= 0 {
		return 1.0
	}
	return math.Max(0.5, math.Min(1.6, *taxaRef/mediana))
}

// Probabilidade combina a matriz calibrada (posição × faixa de distância) com o
// fator da unidade. Piso 0,02 e teto 0,95: nunca prometemos certeza nem zero.
func Probabilidade(ref *modelo.Ref, taxaRef *float64, nRef int, km float64, posicao int) float64 {
	if posicao < 1 {
		posicao = 1
	}
	if posicao > 5 {
		posicao = 5
	}
	f := 0
	switch {
	case km < 2:
		f = 0
	case km < 5:
		f = 1
	default:
		f = 2
	}
	p := ref.PBase[posicao-1][f] * Fator(taxaRef, nRef, ref.Mediana)
	return math.Round(math.Max(0.02, math.Min(0.95, p))*10000) / 10000
}

func motivo(km float64, fator float64) string {
	switch {
	case km < 2 && fator >= 1:
		return "muito perto e com boa taxa de entrada"
	case km < 2:
		return "muito perto da sua referência"
	case fator >= 1.2:
		return "boa taxa de entrada no ano passado"
	default:
		return "dentro do raio que você escolheu"
	}
}

// Ranquear apresenta cada candidata como se fosse a 1ª opção da família — é a
// comparação honesta entre unidades, já que a posição é escolha dela depois.
func Ranquear(ref *modelo.Ref, cands []Candidata, top int) []Sugestao {
	out := make([]Sugestao, 0, len(cands))
	for _, c := range cands {
		f := Fator(c.TaxaRef, c.NRef, ref.Mediana)
		p := Probabilidade(ref, c.TaxaRef, c.NRef, c.Km, 1)
		var pp [5]int
		for i := 1; i <= 5; i++ {
			pp[i-1] = int(math.Round(Probabilidade(ref, c.TaxaRef, c.NRef, c.Km, i) * 100))
		}
		out = append(out, Sugestao{
			Cod: c.Cod, Nome: c.Nome, Bairro: c.Bairro, Lat: c.Lat, Lon: c.Lon,
			Km: math.Round(c.Km*100) / 100, P: p, PPct: int(math.Round(p * 100)), PPorPosicao: pp,
			Fator: math.Round(f*100) / 100, Motivo: motivo(c.Km, f),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].P != out[j].P {
			return out[i].P > out[j].P
		}
		return out[i].Km < out[j].Km
	})
	if len(out) > top {
		out = out[:top]
	}
	return out
}

func ponto(lat, lon float64) string {
	return "SRID=4326;POINT(" + strconv.FormatFloat(lon, 'f', 8, 64) + " " +
		strconv.FormatFloat(lat, 'f', 8, 64) + ")"
}

// Buscar usa o índice GiST: só as unidades dentro do raio que oferecem grupamento+horário.
func Buscar(ctx context.Context, pool *pgxpool.Pool, lat, lon float64,
	grupamento, horario string, raioKm float64) ([]Candidata, error) {
	const q = `
		SELECT u.cod, u.nome, coalesce(u.bairro,''),
		       ST_Y(u.geom::geometry), ST_X(u.geom::geometry),
		       ST_Distance(u.geom, $1::geography) / 1000.0 AS km,
		       u.taxa_ref, u.n_ref
		FROM unidades u
		WHERE EXISTS (SELECT 1 FROM unidade_oferta o
		              WHERE o.cod = u.cod AND o.grupamento = $2 AND o.horario = $3)
		  AND ST_DWithin(u.geom, $1::geography, $4)
		ORDER BY km`
	rows, err := pool.Query(ctx, q, ponto(lat, lon), grupamento, horario, raioKm*1000)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Candidata
	for rows.Next() {
		var c Candidata
		if err := rows.Scan(&c.Cod, &c.Nome, &c.Bairro, &c.Lat, &c.Lon, &c.Km, &c.TaxaRef, &c.NRef); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
