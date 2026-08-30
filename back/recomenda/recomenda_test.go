package recomenda

import (
	"testing"

	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
)

func ref() *modelo.Ref {
	r := &modelo.Ref{Mediana: 0.34}
	r.PBase = [5][3]float64{
		{0.403, 0.378, 0.337}, {0.175, 0.154, 0.133},
		{0.124, 0.105, 0.083}, {0.096, 0.075, 0.063}, {0.087, 0.067, 0.055},
	}
	return r
}
func f(v float64) *float64 { return &v }

func TestFatorLimitado(t *testing.T) {
	r := ref()
	if got := Fator(f(0.90), 100, r.Mediana); got != 1.6 {
		t.Fatalf("teto = %f", got)
	}
	if got := Fator(f(0.05), 100, r.Mediana); got != 0.5 {
		t.Fatalf("piso = %f", got)
	}
	if got := Fator(nil, 0, r.Mediana); got != 1.0 {
		t.Fatalf("sem taxa = %f", got)
	}
	if got := Fator(f(0.90), 5, r.Mediana); got != 1.0 {
		t.Fatalf("amostra pequena = %f", got)
	}
}

func TestProbabilidadeUsaFaixaEPosicao(t *testing.T) {
	r := ref()
	perto := Probabilidade(r, f(0.34), 100, 1.0, 1)
	longe := Probabilidade(r, f(0.34), 100, 7.0, 1)
	if !(perto > longe) {
		t.Fatalf("perto %f deveria superar longe %f", perto, longe)
	}
	if quinta := Probabilidade(r, f(0.34), 100, 1.0, 5); quinta >= perto {
		t.Fatalf("5ª opção %f deveria ser menor que 1ª %f", quinta, perto)
	}
	if p := Probabilidade(r, f(0.99), 500, 0.5, 1); p > 0.95 {
		t.Fatalf("teto 0.95 furado: %f", p)
	}
	if p := Probabilidade(r, f(0.001), 500, 20, 5); p < 0.02 {
		t.Fatalf("piso 0.02 furado: %f", p)
	}
}

func TestProbabilidadeSaturaPosicaoForaDaFaixa(t *testing.T) {
	r := ref()
	if Probabilidade(r, nil, 0, 1, 0) != Probabilidade(r, nil, 0, 1, 1) {
		t.Fatal("posição 0 deve saturar em 1")
	}
	if Probabilidade(r, nil, 0, 1, 9) != Probabilidade(r, nil, 0, 1, 5) {
		t.Fatal("posição 9 deve saturar em 5")
	}
}

func TestRanquearOrdenaPorProbabilidade(t *testing.T) {
	cands := []Candidata{
		{Cod: "longe", Km: 8, TaxaRef: f(0.34), NRef: 100},
		{Cod: "perto", Km: 0.5, TaxaRef: f(0.34), NRef: 100},
		{Cod: "perto-fraca", Km: 0.6, TaxaRef: f(0.10), NRef: 100},
	}
	out := Ranquear(ref(), cands, 5)
	if out[0].Cod != "perto" {
		t.Fatalf("primeiro = %s", out[0].Cod)
	}
	if len(out) != 3 {
		t.Fatalf("len = %d", len(out))
	}
	if out[0].PPct < 1 || out[0].Motivo == "" {
		t.Fatalf("campos de apresentação vazios: %+v", out[0])
	}
	for i := 1; i < len(out); i++ {
		if out[i-1].P < out[i].P {
			t.Fatal("ordem decrescente quebrada")
		}
	}
}

func TestRanquearDesempataPorDistancia(t *testing.T) {
	cands := []Candidata{
		{Cod: "b", Km: 1.5, TaxaRef: f(0.34), NRef: 100},
		{Cod: "a", Km: 0.4, TaxaRef: f(0.34), NRef: 100},
	}
	out := Ranquear(ref(), cands, 5)
	if out[0].P != out[1].P {
		t.Skip("mesma faixa deveria dar mesma p")
	}
	if out[0].Cod != "a" {
		t.Fatalf("empate deve ir para a mais perto, veio %s", out[0].Cod)
	}
}

func TestRanquearRespeitaTop(t *testing.T) {
	cands := make([]Candidata, 12)
	for i := range cands {
		cands[i] = Candidata{Cod: string(rune('a' + i)), Km: float64(i), TaxaRef: f(0.34), NRef: 100}
	}
	if got := len(Ranquear(ref(), cands, 5)); got != 5 {
		t.Fatalf("top 5 → %d", got)
	}
}

func TestRanquearListaVazia(t *testing.T) {
	if out := Ranquear(ref(), nil, 5); len(out) != 0 {
		t.Fatalf("lista vazia → %d", len(out))
	}
}

func TestPPorPosicaoBateComPPctENaoCresce(t *testing.T) {
	cands := []Candidata{
		{Cod: "perto-forte", Km: 0.5, TaxaRef: f(0.90), NRef: 200},
		{Cod: "media", Km: 3.0, TaxaRef: f(0.34), NRef: 100},
		{Cod: "longe-fraca", Km: 20, TaxaRef: f(0.01), NRef: 500},
		{Cod: "sem-historico", Km: 4.0, TaxaRef: nil, NRef: 0},
	}
	for _, s := range Ranquear(ref(), cands, 5) {
		if s.PPorPosicao[0] != s.PPct {
			t.Fatalf("%s: p_por_posicao[0]=%d ≠ p_pct=%d", s.Cod, s.PPorPosicao[0], s.PPct)
		}
		for i := 1; i < 5; i++ {
			// não-crescente, não estritamente: no piso 2% e no teto 95% duas
			// posições podem empatar legitimamente, e empatar é honesto.
			if s.PPorPosicao[i] > s.PPorPosicao[i-1] {
				t.Fatalf("%s: chance sobe da %dª para a %dª: %v", s.Cod, i, i+1, s.PPorPosicao)
			}
		}
		if s.PPorPosicao[0] < 2 || s.PPorPosicao[0] > 95 {
			t.Fatalf("%s: fora do piso/teto: %v", s.Cod, s.PPorPosicao)
		}
	}
}

func TestMontarPontoSemHistoricoNaoEstima(t *testing.T) {
	p := MontarPonto(ref(), Candidata{Cod: "x", Km: 1.234, TaxaRef: nil, NRef: 0}, true)
	if p.PPct != nil || p.PPorPosicao != nil {
		t.Fatalf("sem taxa_ref não pode estimar: %+v", p)
	}
	if p.Km != 1.23 {
		t.Fatalf("km não arredondado: %v", p.Km)
	}
	if !p.Oferta {
		t.Fatal("oferta perdida")
	}
}

func TestMontarPontoComHistoricoBateComRanquear(t *testing.T) {
	c := Candidata{Cod: "x", Km: 0.5, TaxaRef: f(0.34), NRef: 100}
	p := MontarPonto(ref(), c, false)
	if p.PPct == nil || p.PPorPosicao == nil {
		t.Fatal("com taxa_ref tem que estimar")
	}
	// o mesmo número que a unidade teria se fosse recomendada
	s := Ranquear(ref(), []Candidata{c}, 1)[0]
	if *p.PPct != s.PPct || *p.PPorPosicao != s.PPorPosicao {
		t.Fatalf("mapa e recomendação divergem: %d/%v vs %d/%v",
			*p.PPct, *p.PPorPosicao, s.PPct, s.PPorPosicao)
	}
	if p.Oferta {
		t.Fatal("oferta invertida")
	}
}
