package prep

import "testing"

// A régua é o contrato entre o pipeline e o back (back/modelo lê a tabela perguntas
// ORDER BY ordem). Estes invariantes quebram silenciosamente se alguém editar a lista.
func TestReguaPadrao(t *testing.T) {
	r := ReguaPadrao()
	if len(r) != 13 {
		t.Fatalf("perguntas = %d, esperado 13", len(r))
	}
	soma := 0
	ids, ordens := map[int]bool{}, map[int]bool{}
	for _, q := range r {
		soma += q.Pontos
		if ids[q.ID] {
			t.Fatalf("id repetido: %d", q.ID)
		}
		ids[q.ID] = true
		if ordens[q.Ordem] {
			t.Fatalf("ordem repetida: %d", q.Ordem)
		}
		ordens[q.Ordem] = true
		if q.Ordem < 1 || q.Ordem > 13 {
			t.Fatalf("ordem fora de 1..13 em %d: %d", q.ID, q.Ordem)
		}
		if q.Texto == "" {
			t.Fatalf("pergunta %d sem texto", q.ID)
		}
		// desempate e pontuação são a mesma coisa vista de dois lados:
		// perg_criterio='Sim' equivale exatamente a perg_pontuacao=0.
		if q.Desempate != (q.Pontos == 0) {
			t.Fatalf("pergunta %d: desempate=%v mas pontos=%d", q.ID, q.Desempate, q.Pontos)
		}
	}
	if soma != 100 {
		t.Fatalf("soma dos pontos = %d, esperado 100", soma)
	}
}
