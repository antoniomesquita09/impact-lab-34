package modelo

import (
	"testing"
	"time"
)

func refDeTeste() *Ref {
	return &Ref{Perguntas: []Pergunta{
		{ID: 28, Pontos: 51}, {ID: 31, Pontos: 25}, {ID: 20, Pontos: 4}, {ID: 29, Pontos: 0, Desempate: true},
	}}
}

func TestCalcularScore(t *testing.T) {
	r := refDeTeste()
	if got := r.CalcularScore(map[int]bool{28: true, 31: false, 20: true}); got != 55 {
		t.Fatalf("score = %d, esperado 55", got)
	}
	if got := r.CalcularScore(map[int]bool{}); got != 0 {
		t.Fatalf("score vazio = %d", got)
	}
	if got := r.CalcularScore(map[int]bool{29: true}); got != 0 {
		t.Fatalf("desempate não soma: %d", got)
	}
	if got := r.CalcularScore(map[int]bool{999: true}); got != 0 {
		t.Fatalf("id desconhecido: %d", got)
	}
}

func TestGrupamento(t *testing.T) {
	d := func(s string) time.Time { v, _ := time.Parse("2006-01-02", s); return v }
	casos := []struct{ nasc, esperado string }{
		{"2025-06-10", "Berçário"}, {"2023-11-01", "Maternal I"}, {"2022-09-15", "Maternal II"},
		// corte inclusivo: quem faz 2 anos no próprio 31/03 já é Maternal I
		{"2024-03-31", "Maternal I"}, {"2024-04-01", "Berçário"},
	}
	for _, c := range casos {
		if got := GrupamentoPorNascimento(d(c.nasc), 2026); got != c.esperado {
			t.Fatalf("%s → %s, esperado %s", c.nasc, got, c.esperado)
		}
	}
}
