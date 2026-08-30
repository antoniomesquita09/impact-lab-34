package verificacao

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

const mockPath = "../mocks/criterios.json"

func cli() *Cliente { return NovoCliente("", "", mockPath) }

func TestCPFValido(t *testing.T) {
	validos := []string{"10000000019", "10000000108", "10000000280", "12345678909"}
	for _, c := range validos {
		if !CPFValido(c) {
			t.Errorf("%s deveria ser válido", c)
		}
	}
	invalidos := []string{"11111111111", "00000000000", "12345678900", "123", "", "1000000001a"}
	for _, c := range invalidos {
		if CPFValido(c) {
			t.Errorf("%s deveria ser inválido", c)
		}
	}
}

func TestConsultarRejeitaCPFInvalido(t *testing.T) {
	if _, err := cli().Consultar(context.Background(), "111.111.111-11"); err == nil {
		t.Fatal("sequência repetida deveria ser rejeitada")
	}
}

func TestAnaTemCadUnicoBolsaFamiliaEFila(t *testing.T) {
	r, err := cli().Consultar(context.Background(), "100.000.000-19")
	if err != nil {
		t.Fatal(err)
	}
	if !r.Encontrado || r.Pessoa == nil {
		t.Fatal("Ana deveria existir no mock")
	}
	c := r.PorPergunta()
	for _, id := range []int{28, 6, 20, 27} {
		if !c[id].Valor {
			t.Errorf("pergunta %d deveria ser true", id)
		}
		if c[id].Confianca != Alta {
			t.Errorf("pergunta %d deveria ter confiança alta, veio %q", id, c[id].Confianca)
		}
	}
	if c[28].Fonte != "CadÚnico" || c[28].Orgao != "MDS/CAIXA" {
		t.Errorf("procedência do CadÚnico incompleta: %+v", c[28])
	}
	if r.Pessoa.Endereco == nil || r.Pessoa.Endereco.Latitude == nil {
		t.Fatal("Ana tem endereço com coordenada")
	}
	if *r.Pessoa.Endereco.Latitude > -22.8 {
		t.Errorf("coordenada fora de Senador Camará: %v", *r.Pessoa.Endereco.Latitude)
	}
}

func TestPerguntasSensiveisNuncaVemVerificadas(t *testing.T) {
	r, _ := cli().Consultar(context.Background(), "10000000795") // todos positivos
	c := r.PorPergunta()
	for _, id := range []int{17, 16, 12} {
		if _, tem := c[id]; tem {
			t.Errorf("pergunta %d é autodeclarada e não pode vir verificada", id)
		}
	}
	if len(r.NaoVerificaveis) != 3 {
		t.Errorf("esperava 3 perguntas não verificáveis, veio %v", r.NaoVerificaveis)
	}
}

func TestEducacaoEspecialTemConfiancaMedia(t *testing.T) {
	r, _ := cli().Consultar(context.Background(), "10000000361")
	if c := r.PorPergunta()[31]; c.Confianca != Media {
		t.Errorf("pergunta 31 exige conferência humana, veio %q", c.Confianca)
	}
}

func TestCartaoCariocaSemCadUnico(t *testing.T) {
	c := mustConsultar(t, "10000000604").PorPergunta()
	if c[28].Valor {
		t.Error("Iara não tem CadÚnico")
	}
	if !c[6].Valor || c[6].Fonte != "Cartão Carioca" {
		t.Errorf("Bolsa Família/Cartão Carioca deveria ser true via Cartão Carioca: %+v", c[6])
	}
}

func TestSemEnderecoNoCadastro(t *testing.T) {
	r := mustConsultar(t, "10000000280")
	if r.Pessoa.Endereco != nil {
		t.Error("Carla não tem endereço — o mapa precisa abrir sem centro definido")
	}
}

func TestCPFValidoSemRegistro(t *testing.T) {
	r := mustConsultar(t, "10000000876")
	if r.Encontrado {
		t.Error("deveria vir Encontrado=false")
	}
	if len(r.Criterios) != 0 {
		t.Error("sem registro não há critério verificado")
	}
	if len(r.NaoVerificaveis) == 0 {
		t.Error("mesmo sem registro, a lista de não verificáveis vale")
	}
}

func TestCPFForaDoMock(t *testing.T) {
	r := mustConsultar(t, "12345678909")
	if r.Encontrado {
		t.Error("CPF fora do mock deve vir Encontrado=false, não erro")
	}
}

func TestClienteRealUsaBearerEContrato(t *testing.T) {
	var auth, path string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth, path = r.Header.Get("Authorization"), r.URL.Path
		json.NewEncoder(w).Encode(Resposta{
			Encontrado: true,
			Criterios:  []Criterio{{PerguntaID: 28, Valor: true, Fonte: "CadÚnico", Confianca: Alta}},
		})
	}))
	defer srv.Close()

	c := NovoCliente(srv.URL, "t0k", mockPath)
	if c.UsandoMock() {
		t.Fatal("com baseURL e token deveria usar a API")
	}
	r, err := c.Consultar(context.Background(), "10000000019")
	if err != nil {
		t.Fatal(err)
	}
	if auth != "Bearer t0k" {
		t.Errorf("Authorization = %q", auth)
	}
	if path != "/v1/criterios/10000000019" {
		t.Errorf("path = %q", path)
	}
	if !r.PorPergunta()[28].Valor {
		t.Error("resposta da API não foi decodificada")
	}
}

func TestAPIRespondeNaoEncontrado(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	r, err := NovoCliente(srv.URL, "t0k", mockPath).Consultar(context.Background(), "10000000019")
	if err != nil || r.Encontrado {
		t.Fatalf("404 vira Encontrado=false sem erro — veio %v %v", r, err)
	}
}

func mustConsultar(t *testing.T, cpf string) *Resposta {
	t.Helper()
	r, err := cli().Consultar(context.Background(), cpf)
	if err != nil {
		t.Fatal(err)
	}
	return r
}
