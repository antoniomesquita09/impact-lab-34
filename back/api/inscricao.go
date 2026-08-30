package api

import (
	"encoding/json"
	"math"
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
	Validada bool  `json:"validada"`
	Valor    *bool `json:"valor"`
	// Resposta é o que a FAMÍLIA declarou, separado de Valor (o que a
	// Prefeitura verificou). Misturar os dois apagaria a proveniência, que é
	// justamente o que permite auditar o score depois.
	Resposta   *bool  `json:"resposta"`
	Fonte      string `json:"fonte,omitempty"`
	Orgao      string `json:"orgao,omitempty"`
	Referencia string `json:"referencia,omitempty"`
	Confianca  string `json:"confianca,omitempty"`
}

// respostasSalvas devolve o que a família declarou, indexado pelo id da
// pergunta. Mapa vazio quando ainda não respondeu nada.
func (a *App) respostasSalvas(r *http.Request, cpf string) map[int]bool {
	var bruto string
	if err := a.Pool.QueryRow(r.Context(),
		`SELECT respostas::text FROM inscricoes WHERE cpf=$1`, cpf).Scan(&bruto); err != nil {
		return map[int]bool{}
	}
	var texto map[string]bool
	if json.Unmarshal([]byte(bruto), &texto) != nil {
		return map[int]bool{}
	}
	out := make(map[int]bool, len(texto))
	for k, v := range texto {
		if id, err := strconv.Atoi(k); err == nil {
			out[id] = v
		}
	}
	return out
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

	// o que a família já respondeu antes, para o wizard reabrir preenchido
	respostas := a.respostasSalvas(r, cpf)

	saida := make([]perguntaSaida, 0, len(a.Ref.Perguntas))
	for _, q := range a.Ref.Perguntas {
		ps := perguntaSaida{Pergunta: q}
		if v, ok := respostas[q.ID]; ok {
			valor := v
			ps.Resposta = &valor
		}
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
	// precisao: "exata" quando a família marca no mapa; "rua"/"bairro" quando
	// veio do CEP. Nunca devolvemos ponto sem saber de onde ele veio.
	precisao := "exata"
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
		lat, lon, texto, precisao = loc.Lat, loc.Lon, loc.Endereco, string(loc.Precisao)
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
	escreverJSON(w, 200, map[string]any{"lat": lat, "lon": lon, "texto": texto, "precisao": precisao})
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

	// a rede inteira, com distância e chance estimada — o mapa não filtra, mas
	// marca `oferta` para o front dizer quando a turma não existe na unidade
	todas, err := recomenda.TodasUnidades(r.Context(), a.Pool, a.Ref, *lat, *lon, *grupamento, *horario)
	if err != nil {
		erro(w, 500, "Não conseguimos carregar as creches do mapa.")
		return
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
	// comprovante em segundo plano: a inscrição já está salva e confirmada, e
	// uma falha de e-mail não pode desfazer isso nem atrasar a resposta
	go a.enviarComprovante(cpf)
	escreverJSON(w, 200, map[string]any{"ok": true, "opcoes": in.Unidades})
}

// rota devolve o caminho pela via entre a referência da família e uma unidade,
// para o mapa desenhar o traçado. Devolve também km_linha_reta: é ESSA a
// distância que alimenta o modelo, porque a matriz de probabilidade foi
// calibrada em linha reta. Mostrar as duas lado a lado é o honesto — a rota é
// o que a família percorre, a linha reta é o que o modelo viu.
func (a *App) rota(w http.ResponseWriter, r *http.Request, cpf string) {
	cod := r.URL.Query().Get("cod")
	if cod == "" {
		erro(w, 400, "Informe a creche.")
		return
	}
	modo := r.URL.Query().Get("modo")

	var deLat, deLon *float64
	if err := a.Pool.QueryRow(r.Context(),
		`SELECT ST_Y(ref::geometry), ST_X(ref::geometry) FROM inscricoes WHERE cpf=$1`,
		cpf).Scan(&deLat, &deLon); err != nil || deLat == nil || deLon == nil {
		erro(w, 400, "Informe o local de referência primeiro.")
		return
	}

	var nome string
	var paraLat, paraLon, reta float64
	ponto := "SRID=4326;POINT(" + strconv.FormatFloat(*deLon, 'f', 8, 64) + " " +
		strconv.FormatFloat(*deLat, 'f', 8, 64) + ")"
	if err := a.Pool.QueryRow(r.Context(),
		`SELECT nome, ST_Y(geom::geometry), ST_X(geom::geometry),
		        ST_Distance(geom, $2::geography)/1000.0
		 FROM unidades WHERE cod=$1`, cod, ponto).Scan(&nome, &paraLat, &paraLon, &reta); err != nil {
		erro(w, 404, "Creche não encontrada.")
		return
	}

	saida := map[string]any{
		"cod": cod, "nome": nome,
		"de":            map[string]float64{"lat": *deLat, "lon": *deLon},
		"para":          map[string]float64{"lat": paraLat, "lon": paraLon},
		"km_linha_reta": math.Round(reta*100) / 100,
		"rota":          nil,
	}
	if rt, _ := a.Roteador.Rotear(r.Context(), *deLat, *deLon, paraLat, paraLon, modo); rt != nil {
		saida["rota"] = rt
	}
	escreverJSON(w, 200, saida)
}

// estado devolve a inscrição inteira e coesa: as respostas que geraram o score,
// de onde veio cada critério verificado, os dados da criança, a referência e as
// opções. É o registro que a Prefeitura precisa para validar depois a
// informação que produziu aquela pontuação.
func (a *App) estado(w http.ResponseWriter, r *http.Request, cpf string) {
	var score *int
	var grup, hor, texto *string
	var lat, lon *float64
	var opcoes, respostas, prevalidadas string
	var atualizado *time.Time
	a.Pool.QueryRow(r.Context(),
		`SELECT score,grupamento,horario,ref_texto,
		        ST_Y(ref::geometry),ST_X(ref::geometry),
		        opcoes::text,respostas::text,prevalidadas::text,atualizado_em
		 FROM inscricoes WHERE cpf=$1`,
		cpf).Scan(&score, &grup, &hor, &texto, &lat, &lon, &opcoes, &respostas, &prevalidadas, &atualizado)

	lista := []string{}
	json.Unmarshal([]byte(opcoes), &lista)
	resp := map[string]bool{}
	json.Unmarshal([]byte(respostas), &resp)
	pv := map[string]verificacao.Criterio{}
	json.Unmarshal([]byte(prevalidadas), &pv)

	escreverJSON(w, 200, map[string]any{
		"score": score, "grupamento": grup, "horario": hor,
		"ref_texto": texto, "ref_lat": lat, "ref_lon": lon,
		"opcoes":    lista,
		"respostas": resp,
		// carimbo de proveniência por critério: fonte, órgão, referência e
		// confiança do que NÃO foi autodeclarado
		"prevalidadas":  pv,
		"atualizado_em": atualizado,
	})
}
