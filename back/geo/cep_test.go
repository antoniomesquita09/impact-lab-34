package geo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// duplo dos dois serviços: /api/cep/ responde a BrasilAPI, /search o Nominatim.
func servidor(t *testing.T, cepStatus int, cepBody string, nominatim map[string]string) *CEP {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/search" {
			body, ok := nominatim[r.URL.Query().Get("q")]
			if !ok {
				w.Write([]byte(`[]`))
				return
			}
			w.Write([]byte(body))
			return
		}
		w.WriteHeader(cepStatus)
		w.Write([]byte(cepBody))
	}))
	t.Cleanup(srv.Close)
	return &CEP{BaseURL: srv.URL, NominatimURL: srv.URL + "/search", http: http.DefaultClient}
}

const cepSenadorCamara = `{"street":"Caminho do Pires","neighborhood":"Senador Camará","city":"Rio de Janeiro","location":{"coordinates":{"latitude":"-22.90642","longitude":"-43.18223"}}}`

func achou(lat, lon string) string {
	return `[{"lat":"` + lat + `","lon":"` + lon + `","display_name":"x"}]`
}

// A rua é conhecida: coordenada e texto saem os dois do nível de rua.
func TestCEPGeocodificaPelaRua(t *testing.T) {
	c := servidor(t, 200, cepSenadorCamara, map[string]string{
		"Caminho do Pires, Senador Camará, Rio de Janeiro, RJ, Brasil": achou("-22.8801", "-43.5010"),
	})
	l, err := c.Buscar(context.Background(), "21832-000")
	if err != nil || l == nil {
		t.Fatalf("esperado local, veio %v %v", l, err)
	}
	if l.Lat != -22.8801 || l.Lon != -43.5010 {
		t.Fatalf("coordenada não veio do geocodificador: %+v", l)
	}
	if l.Precisao != PrecisaoRua {
		t.Fatalf("precisão = %q", l.Precisao)
	}
}

// A rua não é conhecida: cai para o bairro, e o texto DESCE junto — não pode
// prometer "Caminho do Pires" com a coordenada do centro do bairro.
func TestCEPCaiParaBairroEOTextoAcompanha(t *testing.T) {
	c := servidor(t, 200, cepSenadorCamara, map[string]string{
		"Senador Camará, Rio de Janeiro, RJ, Brasil": achou("-22.8888", "-43.4914"),
	})
	l, err := c.Buscar(context.Background(), "21832-000")
	if err != nil || l == nil {
		t.Fatalf("esperado local, veio %v %v", l, err)
	}
	if l.Lat != -22.8888 || l.Lon != -43.4914 {
		t.Fatalf("coordenada errada: %+v", l)
	}
	if l.Precisao != PrecisaoBairro {
		t.Fatalf("precisão = %q", l.Precisao)
	}
	if l.Endereco != "Senador Camará, Rio de Janeiro" {
		t.Fatalf("o texto tem que descer para o bairro, veio %q", l.Endereco)
	}
}

// O bug que motivou a mudança: a BrasilAPI devolve o centroide do município
// para todo CEP do Rio. Sem geocodificação, não devolvemos ponto nenhum.
func TestCEPNaoUsaCentroideDaBrasilAPI(t *testing.T) {
	c := servidor(t, 200, cepSenadorCamara, nil) // Nominatim não acha nada
	l, err := c.Buscar(context.Background(), "21832-000")
	if err != nil || l != nil {
		t.Fatalf("sem geocodificação deve devolver nil,nil — veio %+v %v", l, err)
	}
}

// Coordenada fora da caixa do Rio é rejeitada: recomendar creche municipal a
// partir de um ponto em outro estado seria pior que não responder.
func TestCEPRejeitaForaDoRio(t *testing.T) {
	c := servidor(t, 200, cepSenadorCamara, map[string]string{
		"Caminho do Pires, Senador Camará, Rio de Janeiro, RJ, Brasil": achou("-23.5505", "-46.6333"),
		"Senador Camará, Rio de Janeiro, RJ, Brasil":                   achou("-23.5505", "-46.6333"),
	})
	if l, _ := c.Buscar(context.Background(), "21832-000"); l != nil {
		t.Fatalf("São Paulo deveria ser rejeitado, veio %+v", l)
	}
}

func TestCEPSemBairroNaoTemComoGeocodificar(t *testing.T) {
	c := servidor(t, 200, `{"street":"Rua X","city":"Rio de Janeiro"}`, nil)
	if l, _ := c.Buscar(context.Background(), "21832000"); l != nil {
		t.Fatal("sem bairro não há como geocodificar")
	}
}

func TestCEPInvalidoNaoChamaRede(t *testing.T) {
	c := &CEP{BaseURL: "http://127.0.0.1:1", NominatimURL: "http://127.0.0.1:1", http: http.DefaultClient}
	if l, err := c.Buscar(context.Background(), "123"); l != nil || err != nil {
		t.Fatal("CEP com menos de 8 dígitos deve sair antes da rede")
	}
}

func TestCEPNaoEncontrado(t *testing.T) {
	c := servidor(t, 404, `{}`, nil)
	if l, _ := c.Buscar(context.Background(), "00000000"); l != nil {
		t.Fatal("404 deve devolver nil")
	}
}

func TestCEPRedeForaNaoDerrubaOFluxo(t *testing.T) {
	c := &CEP{BaseURL: "http://127.0.0.1:1", NominatimURL: "http://127.0.0.1:1", http: http.DefaultClient}
	if l, err := c.Buscar(context.Background(), "22250040"); l != nil || err != nil {
		t.Fatalf("rede fora deve devolver nil,nil — veio %v %v", l, err)
	}
}
