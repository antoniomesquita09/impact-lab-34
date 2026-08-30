package prep

import "testing"

const QA = "../../dados/Bases IC_ ClassificadoseFila/01_QueryA_InscricoesPorAno.csv.gz"
const LOC = "../../dados/OferecimentosEvagas/Unidades_Unificadas_com_Localizacao.xlsx"

func TestLerOpcoes(t *testing.T) {
	n, confirmados := 0, 0
	unid2025 := map[string]bool{}
	err := LerOpcoes(QA, func(o Opcao) {
		n++
		if o.Situacao == "Confirmado" {
			confirmados++
		}
		if o.Ano == 2025 {
			unid2025[o.Unidade] = true
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	if n != 837179 {
		t.Fatalf("linhas = %d, esperado 837179", n)
	}
	if confirmados != 192570 {
		t.Fatalf("confirmados = %d, esperado 192570", confirmados)
	}
	if len(unid2025) != 836 {
		t.Fatalf("unidades 2025 = %d, esperado 836", len(unid2025))
	}
}

func TestLerCoordenadasEJuncao(t *testing.T) {
	cs, err := LerCoordenadas(LOC)
	if err != nil {
		t.Fatal(err)
	}
	// 1941 linhas com lat/lon numéricos; 1 delas vem gravada como (0,0) e é
	// descartada por NoRio — daí 1940.
	if len(cs) != 1940 {
		t.Fatalf("coordenadas = %d, esperado 1940", len(cs))
	}
	porCod := map[string]bool{}
	for _, c := range cs {
		porCod[c.Cod] = true
		if c.Lat > -22.7 || c.Lat < -23.2 || c.Lon > -43.0 || c.Lon < -43.9 {
			t.Fatalf("coordenada fora do Rio: %+v", c)
		}
	}
	if !porCod[ChaveUnidade("0430809")] {
		t.Fatal("0430809 deveria casar via TrimLeft")
	}
}
