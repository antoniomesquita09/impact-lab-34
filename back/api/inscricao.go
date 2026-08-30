package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
	"github.com/antoniomesquita09/impact-lab-34/back/recomenda"
	"github.com/antoniomesquita09/impact-lab-34/back/verificacao"
)

func (a *App) garantirInscricao(r *http.Request, cpf string) {
	a.Pool.Exec(r.Context(), `INSERT INTO inscricoes (cpf) VALUES ($1) ON CONFLICT DO NOTHING`, cpf)
}

// perguntaSaida junta a régua com o que a Prefeitura já conseguiu verificar, e
// carrega o carimbo de proveniência (fonte/órgão/referência/confiança) por critério.
type perguntaSaida struct {
	modelo.Pergunta
	Validada   bool   `json:"validada"`
	Valor      *bool  `json:"valor"`
	Fonte      string `json:"fonte,omitempty"`
	Orgao      string `json:"orgao,omitempty"`
	Referencia string `json:"referencia,omitempty"`
	Confianca  string `json:"confianca,omitempty"`
}

func (a *App) preparar(w http.ResponseWriter, r *http.Request, cpf string) {
	a.garantirInscricao(r, cpf)
	res, err := a.Verificacao.Consultar(r.Context(), cpf)
	if err != nil {
		erro(w, 502, "Não conseguimos consultar os cadastros agora. Tente de novo.")
		return
	}
	pv := res.PorPergunta()

	bruto, _ := json.Marshal(pv)
	a.Pool.Exec(r.Context(), `UPDATE inscricoes SET prevalidadas=$2, atualizado_em=now() WHERE cpf=$1`, cpf, string(bruto))

	saida := make([]perguntaSaida, 0, len(a.Ref.Perguntas))
	for _, q := range a.Ref.Perguntas {
		ps := perguntaSaida{Pergunta: q}
		if v, ok := pv[q.ID]; ok {
			valor := v.Valor
			ps.Validada, ps.Valor, ps.Fonte = true, &valor, v.Fonte
			ps.Orgao, ps.Referencia, ps.Confianca = v.Orgao, v.Referencia, string(v.Confianca)
		}
		saida = append(saida, ps)
	}
	escreverJSON(w, 200, map[string]any{
		"perguntas":        saida,
		"contato":          res.Pessoa,
		"encontrado":       res.Encontrado,
		"nao_verificaveis": res.NaoVerificaveis,
		"grupamentos":      []string{"Berçário", "Maternal I", "Maternal II"},
		"horarios":         []string{"Integral", "Parcial"},
	})
}

func (a *App) respostas(w http.ResponseWriter, r *http.Request, cpf string) {
	var in struct {
		Respostas         map[string]bool `json:"respostas"`
		NascimentoCrianca string          `json:"nascimento_crianca"`
		Horario           string          `json:"horario"`
	}
	if err := lerJSON(r, &in); err != nil {
		erro(w, 400, "Não entendi as respostas enviadas.")
		return
	}
	nasc, err := time.Parse("2006-01-02", in.NascimentoCrianca)
	if err != nil {
		erro(w, 400, "Informe a data de nascimento da criança.")
		return
	}
	if in.Horario != "Integral" && in.Horario != "Parcial" {
		erro(w, 400, "Escolha o turno.")
		return
	}

	a.garantirInscricao(r, cpf)
	final := map[int]bool{}
	for k, v := range in.Respostas {
		if id, err := strconv.Atoi(k); err == nil {
			final[id] = v
		}
	}
	// o que a Prefeitura verificou prevalece sobre o que a família marcou
	var pvJSON string
	a.Pool.QueryRow(r.Context(), `SELECT prevalidadas::text FROM inscricoes WHERE cpf=$1`, cpf).Scan(&pvJSON)
	var pv map[string]verificacao.Criterio
	json.Unmarshal([]byte(pvJSON), &pv)
	for k, v := range pv {
		if id, err := strconv.Atoi(k); err == nil {
			final[id] = v.Valor
		}
	}

	score := a.Ref.CalcularScore(final)
	grup := modelo.GrupamentoPorNascimento(nasc, a.AnoLetivo)
	saida, _ := json.Marshal(final)
	if _, err := a.Pool.Exec(r.Context(),
		`UPDATE inscricoes SET respostas=$2, score=$3, grupamento=$4, horario=$5, atualizado_em=now() WHERE cpf=$1`,
		cpf, string(saida), score, grup, in.Horario); err != nil {
		erro(w, 500, "Não conseguimos salvar suas respostas. Tente de novo.")
		return
	}
	escreverJSON(w, 200, map[string]any{"score": score, "grupamento": grup})
}

func (a *App) referencia(w http.ResponseWriter, r *http.Request, cpf string) {
	var in struct {
		Cep   string   `json:"cep"`
		Lat   *float64 `json:"lat"`
		Lon   *float64 `json:"lon"`
		Texto string   `json:"texto"`
	}
	if err := lerJSON(r, &in); err != nil {
		erro(w, 400, "Não entendi o local enviado.")
		return
	}

	var lat, lon float64
	texto := in.Texto
	switch {
	case in.Lat != nil && in.Lon != nil:
		lat, lon = *in.Lat, *in.Lon
		if texto == "" {
			texto = "Ponto marcado no mapa"
		}
	case in.Cep != "":
		loc, err := a.CEP.Buscar(r.Context(), in.Cep)
		if err != nil || loc == nil {
			erro(w, 422, "Não achamos as coordenadas deste CEP. Marque o ponto no mapa.")
			return
		}
		lat, lon, texto = loc.Lat, loc.Lon, loc.Endereco
	default:
		erro(w, 400, "Informe um CEP ou marque o ponto no mapa.")
		return
	}
	ponto := "SRID=4326;POINT(" + strconv.FormatFloat(lon, 'f', 8, 64) + " " +
		strconv.FormatFloat(lat, 'f', 8, 64) + ")"
	a.garantirInscricao(r, cpf)
	if _, err := a.Pool.Exec(r.Context(),
		`UPDATE inscricoes SET ref=$2::geography, ref_texto=$3, atualizado_em=now() WHERE cpf=$1`,
		cpf, ponto, texto); err != nil {
		erro(w, 500, "Não conseguimos salvar o local. Tente de novo.")
		return
	}
	escreverJSON(w, 200, map[string]any{"lat": lat, "lon": lon, "texto": texto})
}

type pontoMapa struct {
	Cod    string  `json:"cod"`
	Nome   string  `json:"nome"`
	Lat    float64 `json:"lat"`
	Lon    float64 `json:"lon"`
	Bairro string  `json:"bairro"`
}

func (a *App) recomendacoes(w http.ResponseWriter, r *http.Request, cpf string) {
	raio := 5.0
	if v := r.URL.Query().Get("raio_km"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 && f <= 30 {
			raio = f
		}
	}
	var lat, lon *float64
	var texto, grupamento, horario *string
	err := a.Pool.QueryRow(r.Context(),
		`SELECT ST_Y(ref::geometry), ST_X(ref::geometry), ref_texto, grupamento, horario FROM inscricoes WHERE cpf=$1`,
		cpf).Scan(&lat, &lon, &texto, &grupamento, &horario)
	if err != nil || lat == nil || lon == nil {
		erro(w, 400, "Informe o local de referência primeiro.")
		return
	}
	if grupamento == nil || horario == nil {
		erro(w, 400, "Preencha os dados da criança primeiro.")
		return
	}

	cands, err := recomenda.Buscar(r.Context(), a.Pool, *lat, *lon, *grupamento, *horario, raio)
	if err != nil {
		erro(w, 500, "Não conseguimos buscar as creches agora.")
		return
	}
	raioUsado := raio
	if len(cands) == 0 { // amplia o raio uma vez antes de desistir
		raioUsado = raio * 2
		cands, _ = recomenda.Buscar(r.Context(), a.Pool, *lat, *lon, *grupamento, *horario, raioUsado)
	}
	sug := recomenda.Ranquear(a.Ref, cands, 5)

	rows, err := a.Pool.Query(r.Context(),
		`SELECT cod,nome,ST_Y(geom::geometry),ST_X(geom::geometry),coalesce(bairro,'') FROM unidades`)
	todas := []pontoMapa{}
	if err == nil {
		for rows.Next() {
			var p pontoMapa
			if rows.Scan(&p.Cod, &p.Nome, &p.Lat, &p.Lon, &p.Bairro) == nil {
				todas = append(todas, p)
			}
		}
		rows.Close()
	}

	escreverJSON(w, 200, map[string]any{
		"referencia":    map[string]any{"lat": *lat, "lon": *lon, "texto": texto},
		"grupamento":    *grupamento,
		"horario":       *horario,
		"raio_km":       raioUsado,
		"raio_ampliado": raioUsado != raio,
		"recomendadas":  sug,
		"todas":         todas,
	})
}

func (a *App) opcoes(w http.ResponseWriter, r *http.Request, cpf string) {
	var in struct {
		Unidades []string `json:"unidades"`
	}
	if err := lerJSON(r, &in); err != nil {
		erro(w, 400, "Não entendi as opções enviadas.")
		return
	}
	if len(in.Unidades) < 1 || len(in.Unidades) > 5 {
		erro(w, 400, "Escolha de 1 a 5 creches.")
		return
	}
	var validas int
	a.Pool.QueryRow(r.Context(), `SELECT count(DISTINCT cod) FROM unidades WHERE cod = ANY($1)`, in.Unidades).Scan(&validas)
	if validas != len(in.Unidades) {
		erro(w, 400, "Uma das creches escolhidas não existe mais.")
		return
	}

	b, _ := json.Marshal(in.Unidades)
	a.garantirInscricao(r, cpf)
	if _, err := a.Pool.Exec(r.Context(),
		`UPDATE inscricoes SET opcoes=$2, atualizado_em=now() WHERE cpf=$1`, cpf, string(b)); err != nil {
		erro(w, 500, "Não conseguimos salvar suas opções. Tente de novo.")
		return
	}
	escreverJSON(w, 200, map[string]any{"ok": true, "opcoes": in.Unidades})
}

func (a *App) estado(w http.ResponseWriter, r *http.Request, cpf string) {
	var score *int
	var grup, hor, texto *string
	var opcoes string
	a.Pool.QueryRow(r.Context(),
		`SELECT score,grupamento,horario,ref_texto,opcoes::text FROM inscricoes WHERE cpf=$1`,
		cpf).Scan(&score, &grup, &hor, &texto, &opcoes)
	lista := []string{}
	json.Unmarshal([]byte(opcoes), &lista)
	escreverJSON(w, 200, map[string]any{
		"score": score, "grupamento": grup, "horario": hor, "ref_texto": texto, "opcoes": lista,
	})
}
