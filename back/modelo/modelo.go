package modelo

import (
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Pergunta struct {
	ID        int    `json:"id"`
	Texto     string `json:"texto"`
	Pontos    int    `json:"pontos"`
	Desempate bool   `json:"desempate"`
	Validavel bool   `json:"validavel"`
	Ordem     int    `json:"-"`
}

// Ref é a régua vigente e o modelo calibrado, carregados uma vez no boot.
type Ref struct {
	Perguntas []Pergunta
	PBase     [5][3]float64
	Mediana   float64
}

func Carregar(ctx context.Context, pool *pgxpool.Pool) (*Ref, error) {
	r := &Ref{}
	rows, err := pool.Query(ctx, `SELECT id,texto,pontos,desempate,validavel,ordem FROM perguntas ORDER BY ordem`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var q Pergunta
		if err := rows.Scan(&q.ID, &q.Texto, &q.Pontos, &q.Desempate, &q.Validavel, &q.Ordem); err != nil {
			rows.Close()
			return nil, err
		}
		r.Perguntas = append(r.Perguntas, q)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	pr, err := pool.Query(ctx, `SELECT posicao,faixa,p FROM modelo_prob`)
	if err != nil {
		return nil, err
	}
	for pr.Next() {
		var pos, f int
		var p float64
		if err := pr.Scan(&pos, &f, &p); err != nil {
			pr.Close()
			return nil, err
		}
		if pos >= 1 && pos <= 5 && f >= 0 && f <= 2 {
			r.PBase[pos-1][f] = p
		}
	}
	pr.Close()
	if err := pr.Err(); err != nil {
		return nil, err
	}

	var med string
	if err := pool.QueryRow(ctx, `SELECT valor FROM modelo_meta WHERE chave='mediana_taxa_ref'`).Scan(&med); err != nil {
		return nil, err
	}
	r.Mediana, _ = strconv.ParseFloat(med, 64)
	return r, nil
}

// CalcularScore soma os pontos das respostas "Sim". Critérios de desempate valem 0
// e ids desconhecidos são ignorados — a régua do banco é a única fonte de verdade.
func (r *Ref) CalcularScore(respostas map[int]bool) int {
	pontos := make(map[int]int, len(r.Perguntas))
	for _, q := range r.Perguntas {
		pontos[q.ID] = q.Pontos
	}
	total := 0
	for id, sim := range respostas {
		if sim {
			total += pontos[id]
		}
	}
	return total
}

// GrupamentoPorNascimento usa o corte de 31/03 do ano letivo, inclusivo: quem
// completa a idade no próprio dia 31/03 já conta com ela (premissa a confirmar com a SME).
func GrupamentoPorNascimento(nasc time.Time, anoLetivo int) string {
	corte := time.Date(anoLetivo, 3, 31, 0, 0, 0, 0, time.UTC)
	idade := corte.Year() - nasc.Year()
	if corte.Month() < nasc.Month() || (corte.Month() == nasc.Month() && corte.Day() < nasc.Day()) {
		idade--
	}
	switch {
	case idade < 2:
		return "Berçário"
	case idade == 2:
		return "Maternal I"
	default:
		return "Maternal II"
	}
}
