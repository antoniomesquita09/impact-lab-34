package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/antoniomesquita09/impact-lab-34/back/db"
	"github.com/antoniomesquita09/impact-lab-34/back/geo"
	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
	"github.com/antoniomesquita09/impact-lab-34/back/verificacao"
)

const cpfTeste = "00000000191"

func appDeTeste(t *testing.T) (*App, func()) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL não definida")
	}
	ctx := context.Background()
	pool, err := db.Abrir(ctx)
	if err != nil {
		t.Fatal(err)
	}
	ref, err := modelo.Carregar(ctx, pool)
	if err != nil {
		t.Fatalf("rode ./pipeline antes: %v", err)
	}
	pool.Exec(ctx, `DELETE FROM contas WHERE cpf=$1`, cpfTeste)
	return &App{Pool: pool, Ref: ref,
			Verificacao: verificacao.NovoCliente("", "", "../mocks/criterios.json"),
			CEP:         geo.NovoCEP(), Roteador: geo.NovoRoteador(), AnoLetivo: 2026},
		func() { pool.Exec(ctx, `DELETE FROM contas WHERE cpf=$1`, cpfTeste); pool.Close() }
}

func post(t *testing.T, h http.Handler, path, tok string, body any) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", path, bytes.NewReader(b))
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	return w, out
}

func get(t *testing.T, h http.Handler, path, tok string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	return w, out
}

// TestHealthSemBanco garante que o healthCheckPath do Render responde mesmo
// antes de qualquer conexão — é o que impede um deploy de ficar preso.
func TestHealthSemBanco(t *testing.T) {
	w := httptest.NewRecorder()
	(&App{}).Rotas().ServeHTTP(w, httptest.NewRequest("GET", "/api/health", nil))
	if w.Code != 200 || w.Body.String() != "ok" {
		t.Fatalf("health = %d %q", w.Code, w.Body.String())
	}
}

func TestRegistrarEntrarEu(t *testing.T) {
	app, limpar := appDeTeste(t)
	defer limpar()
	h := app.Rotas()

	w, out := post(t, h, "/api/auth/registrar", "", map[string]string{
		"cpf": "000.000.001-91", "nome": "Teste", "nascimento": "1990-01-01", "senha": "segredo"})
	if w.Code != 200 {
		t.Fatalf("registrar = %d: %s", w.Code, w.Body)
	}
	if out["token"] == nil {
		t.Fatal("sem token")
	}

	w2, out2 := post(t, h, "/api/auth/entrar", "", map[string]string{"cpf": cpfTeste, "senha": "segredo"})
	if w2.Code != 200 {
		t.Fatalf("entrar = %d", w2.Code)
	}
	tok := out2["token"].(string)

	w3, out3 := get(t, h, "/api/eu", tok)
	if w3.Code != 200 {
		t.Fatalf("eu = %d", w3.Code)
	}
	if out3["cpf"] != cpfTeste {
		t.Fatalf("eu.cpf = %v", out3["cpf"])
	}
}

func TestSenhaErradaESemToken(t *testing.T) {
	app, limpar := appDeTeste(t)
	defer limpar()
	h := app.Rotas()
	post(t, h, "/api/auth/registrar", "", map[string]string{"cpf": cpfTeste, "nome": "T", "nascimento": "1990-01-01", "senha": "a"})
	if w, _ := post(t, h, "/api/auth/entrar", "", map[string]string{"cpf": cpfTeste, "senha": "b"}); w.Code != 401 {
		t.Fatalf("senha errada = %d, esperado 401", w.Code)
	}
	if w, _ := post(t, h, "/api/auth/registrar", "", map[string]string{"cpf": "123", "nome": "T", "nascimento": "1990-01-01", "senha": "a"}); w.Code != 400 {
		t.Fatalf("CPF curto = %d, esperado 400", w.Code)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/api/eu", nil))
	if w.Code != 401 {
		t.Fatalf("sem token = %d", w.Code)
	}
}

func TestCPFJaCadastrado(t *testing.T) {
	app, limpar := appDeTeste(t)
	defer limpar()
	h := app.Rotas()
	corpo := map[string]string{"cpf": cpfTeste, "nome": "T", "nascimento": "1990-01-01", "senha": "a"}
	post(t, h, "/api/auth/registrar", "", corpo)
	if w, _ := post(t, h, "/api/auth/registrar", "", corpo); w.Code != 409 {
		t.Fatalf("CPF repetido = %d, esperado 409", w.Code)
	}
}

// TestFluxoCompleto percorre o caminho da família: prepara, responde, marca o
// local de referência e recebe as recomendações.
func TestFluxoCompleto(t *testing.T) {
	app, limpar := appDeTeste(t)
	defer limpar()
	h := app.Rotas()
	_, reg := post(t, h, "/api/auth/registrar", "", map[string]string{
		"cpf": cpfTeste, "nome": "Teste", "nascimento": "1990-01-01", "senha": "x"})
	tok, _ := reg["token"].(string)
	if tok == "" {
		t.Fatal("sem token")
	}

	if w, out := get(t, h, "/api/inscricao/preparar", tok); w.Code != 200 {
		t.Fatalf("preparar = %d: %s", w.Code, w.Body)
	} else if len(out["perguntas"].([]any)) == 0 {
		t.Fatal("preparar sem perguntas — a régua não foi carregada")
	}

	w, out := post(t, h, "/api/inscricao/respostas", tok, map[string]any{
		"respostas": map[string]bool{}, "nascimento_crianca": "2025-06-10", "horario": "Integral"})
	if w.Code != 200 {
		t.Fatalf("respostas = %d: %s", w.Code, w.Body)
	}
	if out["grupamento"] != "Berçário" {
		t.Fatalf("grupamento = %v", out["grupamento"])
	}

	// sem referência ainda, recomendações têm que recusar com 400 e mensagem clara
	if w, _ := get(t, h, "/api/inscricao/recomendacoes", tok); w.Code != 400 {
		t.Fatalf("recomendações sem referência = %d, esperado 400", w.Code)
	}

	if w, _ := post(t, h, "/api/inscricao/referencia", tok, map[string]any{
		"lat": -22.9068, "lon": -43.1729, "texto": "Centro"}); w.Code != 200 {
		t.Fatalf("referencia = %d", w.Code)
	}

	w2, out2 := get(t, h, "/api/inscricao/recomendacoes?raio_km=5", tok)
	if w2.Code != 200 {
		t.Fatalf("recomendacoes = %d: %s", w2.Code, w2.Body)
	}
	if out2["recomendadas"] == nil || out2["todas"] == nil {
		t.Fatalf("payload incompleto: %v", out2)
	}
}

func TestRespostasValidaEntrada(t *testing.T) {
	app, limpar := appDeTeste(t)
	defer limpar()
	h := app.Rotas()
	_, reg := post(t, h, "/api/auth/registrar", "", map[string]string{
		"cpf": cpfTeste, "nome": "T", "nascimento": "1990-01-01", "senha": "x"})
	tok := reg["token"].(string)
	if w, _ := post(t, h, "/api/inscricao/respostas", tok, map[string]any{
		"respostas": map[string]bool{}, "nascimento_crianca": "", "horario": "Integral"}); w.Code != 400 {
		t.Fatal("nascimento vazio deveria dar 400")
	}
	if w, _ := post(t, h, "/api/inscricao/respostas", tok, map[string]any{
		"respostas": map[string]bool{}, "nascimento_crianca": "2025-06-10", "horario": "Noturno"}); w.Code != 400 {
		t.Fatal("turno inválido deveria dar 400")
	}
}

func TestOpcoesRecusaListaInvalida(t *testing.T) {
	app, limpar := appDeTeste(t)
	defer limpar()
	h := app.Rotas()
	_, reg := post(t, h, "/api/auth/registrar", "", map[string]string{
		"cpf": cpfTeste, "nome": "T", "nascimento": "1990-01-01", "senha": "x"})
	tok := reg["token"].(string)
	if w, _ := post(t, h, "/api/inscricao/opcoes", tok, map[string]any{"unidades": []string{}}); w.Code != 400 {
		t.Fatal("lista vazia deveria dar 400")
	}
	if w, _ := post(t, h, "/api/inscricao/opcoes", tok, map[string]any{
		"unidades": []string{"a", "b", "c", "d", "e", "f"}}); w.Code != 400 {
		t.Fatal("6 opções deveria dar 400")
	}
	if w, _ := post(t, h, "/api/inscricao/opcoes", tok, map[string]any{
		"unidades": []string{"NAO_EXISTE"}}); w.Code != 400 {
		t.Fatal("unidade inexistente deveria dar 400")
	}
}

// TestEstadoDevolveRegistroCoeso garante que a inscrição é recuperável inteira
// por CPF: as respostas que geraram o score, a proveniência do que foi
// verificado, os dados da criança, a referência e as opções.
func TestEstadoDevolveRegistroCoeso(t *testing.T) {
	app, limpar := appDeTeste(t)
	defer limpar()
	h := app.Rotas()
	_, reg := post(t, h, "/api/auth/registrar", "", map[string]string{
		"cpf": cpfTeste, "nome": "T", "nascimento": "1990-01-01", "senha": "x"})
	tok := reg["token"].(string)

	get(t, h, "/api/inscricao/preparar", tok)
	post(t, h, "/api/inscricao/respostas", tok, map[string]any{
		"respostas": map[string]bool{"20": true}, "nascimento_crianca": "2025-06-10", "horario": "Integral"})
	post(t, h, "/api/inscricao/referencia", tok, map[string]any{"lat": -22.9068, "lon": -43.1729, "texto": "Centro"})

	w, out := get(t, h, "/api/inscricao", tok)
	if w.Code != 200 {
		t.Fatalf("estado = %d", w.Code)
	}
	resp, ok := out["respostas"].(map[string]any)
	if !ok || resp["20"] != true {
		t.Fatalf("respostas não voltaram: %v", out["respostas"])
	}
	if out["score"] == nil || out["grupamento"] != "Berçário" || out["horario"] != "Integral" {
		t.Fatalf("dados da criança incompletos: %v", out)
	}
	if out["ref_texto"] != "Centro" || out["ref_lat"] == nil || out["ref_lon"] == nil {
		t.Fatalf("referência incompleta: %v", out)
	}
	if out["prevalidadas"] == nil || out["atualizado_em"] == nil {
		t.Fatalf("proveniência ou carimbo de tempo ausentes: %v", out)
	}
}

// TestPrepararReabreComAsRespostasDaFamilia: ao voltar ao wizard, a família vê
// o que já respondeu — sem o front precisar guardar cópia no navegador.
func TestPrepararReabreComAsRespostasDaFamilia(t *testing.T) {
	app, limpar := appDeTeste(t)
	defer limpar()
	h := app.Rotas()
	_, reg := post(t, h, "/api/auth/registrar", "", map[string]string{
		"cpf": cpfTeste, "nome": "T", "nascimento": "1990-01-01", "senha": "x"})
	tok := reg["token"].(string)

	get(t, h, "/api/inscricao/preparar", tok)
	post(t, h, "/api/inscricao/respostas", tok, map[string]any{
		"respostas": map[string]bool{"20": true}, "nascimento_crianca": "2025-06-10", "horario": "Integral"})

	_, out := get(t, h, "/api/inscricao/preparar", tok)
	achou := false
	for _, p := range out["perguntas"].([]any) {
		q := p.(map[string]any)
		if int(q["id"].(float64)) == 20 {
			if q["resposta"] != true {
				t.Fatalf("resposta da família não voltou na pergunta 20: %v", q)
			}
			achou = true
		}
	}
	if !achou {
		t.Fatal("pergunta 20 não veio no preparar")
	}
}
