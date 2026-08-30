package prep

import "testing"

const (
	CAP  = "../../dados/externos/SME_Capacidade-total-por-grupamento-11-07-2025.xlsx"
	MAT  = "../../dados/OferecimentosEvagas/totaalunoscreche2025.xlsx"
	PARC = "../../dados/OferecimentosEvagas/Parceiras2025.xlsx"
	ABA  = "MAIO -2025"
)

// Números oficiais da Transparência–Creches da SME (11/07/2025). Se a planilha for
// trocada por uma de outro ano, este teste falha — que é o que se quer.
func TestLerCapacidadePublica(t *testing.T) {
	cap, err := LerCapacidadePublica(CAP)
	if err != nil {
		t.Fatal(err)
	}
	if len(cap) != 488 {
		t.Fatalf("unidades = %d, esperado 488", len(cap))
	}
	total, porG := 0, map[string]int{}
	for _, m := range cap {
		for g, v := range m {
			total += v
			porG[g] += v
		}
	}
	if total != 53432 {
		t.Fatalf("capacidade total = %d, esperado 53432", total)
	}
	for g, esperado := range map[string]int{GrupBercario: 10626, GrupMaternal1: 18622, GrupMaternal2: 24184} {
		if porG[g] != esperado {
			t.Fatalf("%s = %d, esperado %d", g, porG[g], esperado)
		}
	}
}

func TestLerMatriculaPublica(t *testing.T) {
	mat, err := LerMatriculaPublica(MAT)
	if err != nil {
		t.Fatal(err)
	}
	if len(mat) != 488 {
		t.Fatalf("unidades = %d, esperado 488", len(mat))
	}
	total, porT := 0, map[string]int{}
	for _, g := range mat {
		for _, turnos := range g {
			for turno, v := range turnos {
				total += v
				porT[turno] += v
			}
		}
	}
	if total != 46975 {
		t.Fatalf("matrícula total = %d, esperado 46975", total)
	}
	if porT[TurnoIntegral] != 37956 || porT[TurnoParcial] != 9019 {
		t.Fatalf("integral/parcial = %d/%d, esperado 37956/9019", porT[TurnoIntegral], porT[TurnoParcial])
	}

	// as duas fontes públicas têm que falar da mesma rede
	cap, err := LerCapacidadePublica(CAP)
	if err != nil {
		t.Fatal(err)
	}
	casam := 0
	for cod := range cap {
		if _, ok := mat[cod]; ok {
			casam++
		}
	}
	if casam != 488 {
		t.Fatalf("capacidade ↔ matrícula casam %d de 488", casam)
	}
}

func TestLerParceiras(t *testing.T) {
	p, err := LerParceiras(PARC, ABA)
	if err != nil {
		t.Fatal(err)
	}
	if len(p) != 347 {
		t.Fatalf("parceiras = %d, esperado 347", len(p))
	}
	meta, aluno, ociosas := 0, 0, 0
	for _, m := range p {
		for _, v := range m {
			meta += v.Meta
			aluno += v.Aluno
			ociosas += maxZero(v.Vagas)
		}
	}
	// A soma das metas por grupamento (44.782) fica 9 acima da coluna "Meta Total"
	// da própria planilha (44.773) — divergência interna da fonte, não do código.
	if meta != 44782 {
		t.Fatalf("meta somada por grupamento = %d, esperado 44782", meta)
	}
	if aluno != 42108 {
		t.Fatalf("matriculados = %d, esperado 42108", aluno)
	}
	// Com piso zero por grupamento dá 3.055, acima das 1.665 do rodapé da planilha:
	// superlotação num grupamento não compensa vaga em outro. Serve para dizer
	// "há 5 vagas ociosas em Maternal I nesta creche"; não serve de manchete somada.
	if ociosas != 3055 {
		t.Fatalf("ociosas (piso zero por grupamento) = %d, esperado 3055", ociosas)
	}
}

func TestMontarCapacidade(t *testing.T) {
	uns, _, err := Agregar(QA, LOC, 2025)
	if err != nil {
		t.Fatal(err)
	}
	capPub, err := LerCapacidadePublica(CAP)
	if err != nil {
		t.Fatal(err)
	}
	matPub, err := LerMatriculaPublica(MAT)
	if err != nil {
		t.Fatal(err)
	}
	parc, err := LerParceiras(PARC, ABA)
	if err != nil {
		t.Fatal(err)
	}

	linhas, semUnidade := MontarCapacidade(uns, capPub, matPub, parc)
	if len(linhas) == 0 {
		t.Fatal("nenhuma linha de capacidade")
	}

	// toda linha aponta para uma unidade do catálogo (a FK do banco depende disso)
	cods := map[string]bool{}
	for _, u := range uns {
		cods[u.Cod] = true
	}
	chaves := map[[3]string]bool{}
	publicasCertas, inferidas := 0, 0
	for _, l := range linhas {
		if !cods[l.Cod] {
			t.Fatalf("linha aponta para unidade inexistente: %+v", l)
		}
		k := [3]string{l.Cod, l.Grupamento, l.Turno}
		if chaves[k] {
			t.Fatalf("chave primária repetida: %v", k)
		}
		chaves[k] = true
		if l.Capacidade < 0 || l.Matriculados < 0 || l.Ociosas < 0 {
			t.Fatalf("número negativo na tela: %+v", l)
		}
		if l.Ociosas > l.Capacidade {
			t.Fatalf("mais ociosas que vagas: %+v", l)
		}
		if l.Referencia == "" || l.Fonte == "" {
			t.Fatalf("linha sem proveniência: %+v", l)
		}
		if l.TurnoInferido {
			inferidas++
		} else if l.Fonte == FontePublica {
			publicasCertas++
		}
	}
	// a rede pública é quase toda de turno único: a maioria das linhas é certa
	if publicasCertas < 700 {
		t.Fatalf("linhas públicas de turno certo = %d, esperado bem mais", publicasCertas)
	}
	if inferidas == 0 {
		t.Fatal("nenhuma linha inferida — o rateio das mistas não rodou")
	}
	if semUnidade == 0 || semUnidade > 40 {
		t.Fatalf("códigos sem unidade no catálogo = %d, esperado poucos e não zero", semUnidade)
	}
	t.Logf("%d linhas · %d públicas com turno certo · %d inferidas · %d códigos descartados",
		len(linhas), publicasCertas, inferidas, semUnidade)
}
