package prep

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

// Vocabulário canônico, ditado pela Query A (é o que o back e o front já usam):
// grupamento ∈ {Berçário, Maternal I, Maternal II}, turno ∈ {Integral, Parcial}.
// As três planilhas de capacidade escrevem cada uma do seu jeito e são traduzidas
// para cá na leitura — quem consome nunca vê a grafia da fonte.
const (
	GrupBercario  = "Berçário"
	GrupMaternal1 = "Maternal I"
	GrupMaternal2 = "Maternal II"

	TurnoIntegral = "Integral"
	TurnoParcial  = "Parcial"
)

// Grupamentos na ordem etária.
var Grupamentos = []string{GrupBercario, GrupMaternal1, GrupMaternal2}

// Turnos possíveis.
var Turnos = []string{TurnoIntegral, TurnoParcial}

// canonGrupamento traduz a grafia de qualquer das planilhas para o vocabulário
// canônico. As parceiras separam Berçário I e II; a rede não, então os dois somam
// no mesmo balde. Devolve "" para cabeçalho que não é grupamento.
func canonGrupamento(s string) string {
	t := strings.ToUpper(strings.TrimSpace(s))
	t = strings.NewReplacer("Ç", "C", "Á", "A", "Â", "A", "Ã", "A", "É", "E", "Í", "I", "Ó", "O", "Ú", "U").Replace(t)
	switch {
	case strings.HasPrefix(t, "BERCARIO"):
		return GrupBercario
	case strings.HasPrefix(t, "MATERNAL II"), strings.HasPrefix(t, "MAT.II"), strings.HasPrefix(t, "MAT. II"):
		return GrupMaternal2
	case strings.HasPrefix(t, "MATERNAL I"), strings.HasPrefix(t, "MAT.I"), strings.HasPrefix(t, "MAT. I"):
		return GrupMaternal1
	default:
		return ""
	}
}

// inteiro lê uma célula numérica tolerando vazio, separador de milhar e sinal.
// Célula ilegível vale 0 — nestas planilhas o vazio significa "não oferta".
func inteiro(s string) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	s = strings.ReplaceAll(s, ".", "")
	s = strings.ReplaceAll(s, ",", "")
	n, err := strconv.Atoi(s)
	if err != nil {
		f, err2 := strconv.ParseFloat(strings.TrimSpace(strings.ReplaceAll(s, " ", "")), 64)
		if err2 != nil {
			return 0
		}
		return int(f)
	}
	return n
}

func abrirAba(path, aba string) ([][]string, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	nome := aba
	if nome == "" {
		nome = f.GetSheetName(0)
	}
	rows, err := f.GetRows(nome)
	if err != nil {
		return nil, fmt.Errorf("aba %q de %s: %w", nome, path, err)
	}
	return rows, nil
}

// LerCapacidadePublica lê a capacidade oficial por grupamento das unidades públicas
// (Transparência–Creches da SME, referência 11/07/2025).
// Devolve ChaveUnidade → grupamento canônico → vagas.
func LerCapacidadePublica(path string) (map[string]map[string]int, error) {
	rows, err := abrirAba(path, "")
	if err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("%s: planilha sem dados", path)
	}

	// cabeçalho de uma linha: Designação | Denominacao | Berçário | Maternal I | Maternal II | Total Geral
	colGrup := map[int]string{}
	colCod := -1
	for i, h := range rows[0] {
		if g := canonGrupamento(h); g != "" {
			colGrup[i] = g
		}
		if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(h)), "DESIGNA") {
			colCod = i
		}
	}
	if colCod < 0 {
		return nil, fmt.Errorf("%s: coluna Designação não encontrada", path)
	}
	if len(colGrup) != 3 {
		return nil, fmt.Errorf("%s: esperava 3 colunas de grupamento, achei %d", path, len(colGrup))
	}

	out := map[string]map[string]int{}
	for _, r := range rows[1:] {
		if colCod >= len(r) {
			continue
		}
		cod := ChaveUnidade(r[colCod])
		if cod == "" {
			continue
		}
		for i, g := range colGrup {
			if i >= len(r) {
				continue
			}
			if v := inteiro(r[i]); v > 0 {
				if out[cod] == nil {
					out[cod] = map[string]int{}
				}
				out[cod][g] += v
			}
		}
	}
	return out, nil
}

// LerMatriculaPublica lê a matrícula das unidades públicas por grupamento e turno
// (Sistema de Gestão Acadêmica, aba Consolidado — atualização dinâmica).
// Devolve ChaveUnidade → grupamento → turno → alunos.
//
// A aba tem cabeçalho de três linhas: grupamento (mesclado, propaga à direita),
// turno (idem) e o campo (Aluno/Turma). Só as colunas "Aluno" interessam.
func LerMatriculaPublica(path string) (map[string]map[string]map[string]int, error) {
	rows, err := abrirAba(path, "Consolidado")
	if err != nil {
		return nil, err
	}
	if len(rows) < 4 {
		return nil, fmt.Errorf("%s: aba Consolidado sem dados", path)
	}
	hGrup, hTurno, hCampo := rows[0], rows[1], rows[2]

	larg := len(hCampo)
	type destino struct{ grup, turno string }
	col := map[int]destino{}
	colCod := -1

	grupAtual, turnoAtual := "", ""
	for i := 0; i < larg; i++ {
		if i < len(hGrup) {
			if g := canonGrupamento(hGrup[i]); g != "" {
				grupAtual = g
				turnoAtual = "" // grupamento novo reinicia o turno
			} else if v := strings.ToUpper(strings.TrimSpace(hGrup[i])); v != "" && !strings.HasPrefix(v, "CRECHE") {
				// cabeçalho que não é grupamento (CRE, Designação…) encerra o bloco
				if v != "" && grupAtual != "" && !strings.HasPrefix(v, "TOTAL") {
					grupAtual = ""
				}
			} else if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(hGrup[i])), "CRECHE") {
				grupAtual = "" // coluna CRECHE TOTAL: não é grupamento
			}
		}
		if i < len(hTurno) {
			switch strings.ToUpper(strings.TrimSpace(hTurno[i])) {
			case "INTEGRAL":
				turnoAtual = TurnoIntegral
			case "PARCIAL":
				turnoAtual = TurnoParcial
			}
		}
		campo := ""
		if i < len(hCampo) {
			campo = strings.ToUpper(strings.TrimSpace(hCampo[i]))
			if strings.HasPrefix(campo, "DESIGNA") {
				colCod = i
			}
		}
		if campo == "ALUNO" && grupAtual != "" && turnoAtual != "" {
			col[i] = destino{grupAtual, turnoAtual}
		}
	}
	if colCod < 0 {
		return nil, fmt.Errorf("%s: coluna Designacao não encontrada na aba Consolidado", path)
	}
	if len(col) != 6 {
		return nil, fmt.Errorf("%s: esperava 6 colunas Aluno (3 grupamentos × 2 turnos), achei %d", path, len(col))
	}

	out := map[string]map[string]map[string]int{}
	for _, r := range rows[3:] {
		if colCod >= len(r) {
			continue
		}
		cod := ChaveUnidade(r[colCod])
		if cod == "" {
			continue
		}
		for i, d := range col {
			if i >= len(r) {
				continue
			}
			v := inteiro(r[i])
			if v == 0 {
				continue
			}
			if out[cod] == nil {
				out[cod] = map[string]map[string]int{}
			}
			if out[cod][d.grup] == nil {
				out[cod][d.grup] = map[string]int{}
			}
			out[cod][d.grup][d.turno] += v
		}
	}
	return out, nil
}

// Parceira é a meta (capacidade contratada), a matrícula e as vagas ociosas de uma
// creche conveniada num grupamento. A planilha NÃO informa turno.
//
// Vagas é a coluna que a própria SME calcula, e não é Meta-Aluno: ela também desconta
// alunos incluídos e abatimentos. Preferimos o número dela ao nosso.
type Parceira struct{ Meta, Aluno, Vagas int }

// LerParceiras lê o consolidado mensal das creches conveniadas enviado pelas CREs
// (aba MAIO -2025, referência maio/2025). Devolve ChaveUnidade → grupamento → Parceira.
//
// Berçário I e II somam no mesmo balde. O `CÓDIGO SGA` às vezes vem numérico (sem os
// zeros à esquerda) e às vezes como texto; ChaveUnidade normaliza os dois casos, que
// é por que aqui não faz falta o zfill(5) — a comparação é sempre sem zeros.
func LerParceiras(path, aba string) (map[string]map[string]Parceira, error) {
	rows, err := abrirAba(path, aba)
	if err != nil {
		return nil, err
	}
	if len(rows) < 3 {
		return nil, fmt.Errorf("%s: aba %q sem dados", path, aba)
	}
	hGrup, hCampo := rows[0], rows[1]

	type destino struct {
		grup  string
		campo string // "META" | "ALUNO" | "VAGAS"
	}
	col := map[int]destino{}
	colCod := -1
	grupAtual := ""
	for i := 0; i < len(hCampo); i++ {
		if i < len(hGrup) {
			if g := canonGrupamento(hGrup[i]); g != "" {
				grupAtual = g
			}
		}
		campo := strings.ToUpper(strings.TrimSpace(hCampo[i]))
		if strings.HasPrefix(campo, "CÓDIGO") || strings.HasPrefix(campo, "CODIGO") {
			colCod = i
		}
		// As colunas de total no fim da planilha (Total Alunos, Total Incluídos,
		// Abatimentos, Vagas) vêm depois do último grupamento e herdariam o balde
		// de Maternal II; o primeiro "Total…" encerra o último bloco.
		if strings.HasPrefix(campo, "TOTAL") || campo == "ABATIMENTOS" {
			grupAtual = ""
		}
		if grupAtual == "" || campo == "META TOTAL" {
			continue
		}
		switch campo {
		case "META":
			col[i] = destino{grupAtual, "META"}
		case "ALUNO":
			col[i] = destino{grupAtual, "ALUNO"}
		case "VAGAS":
			col[i] = destino{grupAtual, "VAGAS"}
		}
	}
	if colCod < 0 {
		return nil, fmt.Errorf("%s: coluna CÓDIGO SGA não encontrada", path)
	}
	// 4 blocos de grupamento na fonte (Berçário I e II somam em um) × 3 campos
	if len(col) != 12 {
		return nil, fmt.Errorf("%s: esperava 12 colunas Meta/Aluno/Vagas, achei %d", path, len(col))
	}

	out := map[string]map[string]Parceira{}
	for _, r := range rows[2:] {
		if colCod >= len(r) {
			continue
		}
		cod := ChaveUnidade(r[colCod])
		if cod == "" {
			continue
		}
		for i, d := range col {
			if i >= len(r) {
				continue
			}
			v := inteiro(r[i]) // Vagas pode ser negativo (turma acima da meta)
			if v == 0 {
				continue
			}
			if out[cod] == nil {
				out[cod] = map[string]Parceira{}
			}
			p := out[cod][d.grup]
			switch d.campo {
			case "META":
				p.Meta += v
			case "ALUNO":
				p.Aluno += v
			case "VAGAS":
				p.Vagas += v
			}
			out[cod][d.grup] = p
		}
	}
	return out, nil
}

// Datas de referência de cada fonte. Viajam junto com o número até a tela: as três
// planilhas têm datas diferentes e a família precisa saber de quando é o dado.
const (
	RefCapacidadePublica = "2025-07-11" // Transparência–Creches da SME
	RefParceiras         = "2025-05"    // consolidado das CREs, aba MAIO -2025
)

// Fontes possíveis de uma linha de capacidade.
const (
	FontePublica  = "publica"
	FonteParceira = "parceira"
)

// LinhaCapacidade é uma linha de unidade_capacidade: quantas vagas existem, quantas
// estão ocupadas e quantas sobram, por unidade × grupamento × turno.
//
// TurnoInferido = false significa unidade de turno único: a capacidade inteira é
// daquele turno e o número está certo. TurnoInferido = true significa que a fonte não
// informa turno — a linha aparece nos dois turnos com o mesmo valor, para casar com
// qualquer busca, e por isso **linhas inferidas não podem ser somadas entre turnos**.
// Na tela, onde for true, mostre o grupamento sem afirmar o turno.
type LinhaCapacidade struct {
	Cod, Grupamento, Turno            string
	Capacidade, Matriculados, Ociosas int
	TurnoInferido                     bool
	Fonte, Referencia                 string
}

func maxZero(n int) int {
	if n < 0 {
		return 0
	}
	return n
}

// MontarCapacidade cruza capacidade, matrícula e parceiras com as unidades do catálogo.
//
// Só existe linha onde existe fonte: unidade sem dado fica de fora, nunca com zero —
// "0 vagas ociosas" e "não sabemos" são coisas diferentes e a tela não pode confundi-las.
// Devolve também quantos códigos das planilhas não casaram com nenhuma unidade (as 5
// parceiras sem linha em maio/2025 caem aqui), para o pipeline logar em vez de mandar
// para o banco e estourar a chave estrangeira.
func MontarCapacidade(
	uns []Unidade,
	capPub map[string]map[string]int,
	matPub map[string]map[string]map[string]int,
	parc map[string]map[string]Parceira,
) (linhas []LinhaCapacidade, semUnidade int) {
	// as planilhas falam em código sem zeros; unidades.cod é o código como vem da Query A
	cod := make(map[string]string, len(uns))
	for _, u := range uns {
		cod[ChaveUnidade(u.Cod)] = u.Cod
	}

	// ---------- rede pública: capacidade por grupamento, turno pela matrícula observada
	for chave, porGrup := range capPub {
		real, ok := cod[chave]
		if !ok {
			semUnidade++
			continue
		}
		for _, g := range Grupamentos {
			c := porGrup[g]
			if c == 0 {
				continue // não oferta este grupamento
			}
			mI, mP := matPub[chave][g][TurnoIntegral], matPub[chave][g][TurnoParcial]
			base := LinhaCapacidade{Cod: real, Grupamento: g, Fonte: FontePublica, Referencia: RefCapacidadePublica}

			switch {
			case mI > 0 && mP == 0: // turno único: o número está certo
				l := base
				l.Turno, l.Capacidade, l.Matriculados = TurnoIntegral, c, mI
				l.Ociosas = maxZero(c - mI)
				linhas = append(linhas, l)

			case mP > 0 && mI == 0:
				l := base
				l.Turno, l.Capacidade, l.Matriculados = TurnoParcial, c, mP
				l.Ociosas = maxZero(c - mP)
				linhas = append(linhas, l)

			case mI > 0 && mP > 0: // mista: rateia a capacidade na proporção da própria
				// unidade naquele grupamento — o share integral cai muito com a idade,
				// então ratear pelo total da unidade erraria mais.
				capI := (c*mI + (mI+mP)/2) / (mI + mP) // arredonda
				capP := c - capI
				lI, lP := base, base
				lI.Turno, lI.Capacidade, lI.Matriculados, lI.TurnoInferido = TurnoIntegral, capI, mI, true
				lI.Ociosas = maxZero(capI - mI)
				lP.Turno, lP.Capacidade, lP.Matriculados, lP.TurnoInferido = TurnoParcial, capP, mP, true
				lP.Ociosas = maxZero(capP - mP)
				linhas = append(linhas, lI, lP)

			default: // capacidade sem nenhuma matrícula: turno desconhecido
				for _, t := range Turnos {
					l := base
					l.Turno, l.Capacidade, l.Matriculados, l.TurnoInferido = t, c, 0, true
					l.Ociosas = c
					linhas = append(linhas, l)
				}
			}
		}
	}

	// ---------- creches parceiras: a fonte não informa turno em nenhum caso
	for chave, porGrup := range parc {
		real, ok := cod[chave]
		if !ok {
			semUnidade++
			continue
		}
		for _, g := range Grupamentos {
			p, temGrup := porGrup[g]
			if !temGrup || p.Meta == 0 {
				continue
			}
			for _, t := range Turnos {
				linhas = append(linhas, LinhaCapacidade{
					Cod: real, Grupamento: g, Turno: t,
					Capacidade: p.Meta, Matriculados: p.Aluno,
					Ociosas:       maxZero(p.Vagas), // coluna calculada pela SME
					TurnoInferido: true,
					Fonte:         FonteParceira, Referencia: RefParceiras,
				})
			}
		}
	}
	return linhas, semUnidade
}
