package prep

import (
	"math"
	"testing"
)

func TestHaversineEFaixa(t *testing.T) {
	if d := HaversineKm(-22.9, -43.2, -22.9, -43.2); d > 1e-9 {
		t.Fatalf("mesma coordenada = %f", d)
	}
	if d := HaversineKm(-22.900, -43.200, -22.960, -43.200); math.Abs(d-6.67) > 0.15 {
		t.Fatalf("6.67 km esperado, veio %f", d)
	}
	if Faixa(1.9) != 0 || Faixa(2.0) != 1 || Faixa(4.9) != 1 || Faixa(5.0) != 2 {
		t.Fatal("limites de faixa errados")
	}
}

func TestAgregar(t *testing.T) {
	uns, m, err := Agregar(QA, LOC, 2025)
	if err != nil {
		t.Fatal(err)
	}
	if len(uns) < 800 || len(uns) > 880 {
		t.Fatalf("unidades = %d", len(uns))
	}

	// matriz monotônica: mais longe confirma menos; opção mais tardia confirma menos
	for pos := 0; pos < 5; pos++ {
		if !(m.PBase[pos][0] >= m.PBase[pos][1] && m.PBase[pos][1] >= m.PBase[pos][2]) {
			t.Fatalf("posição %d não decresce com a distância: %v", pos+1, m.PBase[pos])
		}
	}
	if m.PBase[0][0] <= m.PBase[4][0] {
		t.Fatal("1ª opção deveria superar a 5ª")
	}
	if m.PBase[0][0] < 0.35 || m.PBase[0][0] > 0.45 {
		t.Fatalf("p_base[1][<2km] = %f, esperado ~0.40", m.PBase[0][0])
	}
	if m.Mediana < 0.20 || m.Mediana > 0.50 {
		t.Fatalf("mediana = %f", m.Mediana)
	}

	comOferta, comTaxa := 0, 0
	for _, u := range uns {
		if len(u.Oferta) > 0 {
			comOferta++
		}
		if u.TaxaRef != nil {
			comTaxa++
			if *u.TaxaRef < 0 || *u.TaxaRef > 1 {
				t.Fatalf("taxa fora de [0,1]: %f", *u.TaxaRef)
			}
		}
	}
	if comOferta < 700 || comTaxa < 700 {
		t.Fatalf("oferta=%d taxa=%d", comOferta, comTaxa)
	}
}
