package geo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func servidor(t *testing.T, status int, body string) *CEP {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return &CEP{BaseURL: srv.URL, http: http.DefaultClient}
}

func TestCEPComCoordenadas(t *testing.T) {
	c := servidor(t, 200, `{"street":"Rua Voluntários da Pátria","neighborhood":"Botafogo","city":"Rio de Janeiro","location":{"coordinates":{"latitude":"-22.952","longitude":"-43.187"}}}`)
	l, err := c.Buscar(context.Background(), "22.250-040")
	if err != nil || l == nil {
		t.Fatalf("esperado local, veio %v %v", l, err)
	}
	if l.Lat != -22.952 || l.Lon != -43.187 {
		t.Fatalf("coordenadas erradas: %+v", l)
	}
	if l.Bairro != "Botafogo" {
		t.Fatalf("bairro = %q", l.Bairro)
	}
}

func TestCEPSemCoordenadas(t *testing.T) {
	c := servidor(t, 200, `{"street":"Rua X","neighborhood":"Senador Camará","location":{"coordinates":{}}}`)
	l, err := c.Buscar(context.Background(), "21832000")
	if err != nil || l != nil {
		t.Fatalf("sem coordenadas deve devolver nil,nil — veio %v %v", l, err)
	}
}

func TestCEPInvalidoNaoChamaRede(t *testing.T) {
	c := &CEP{BaseURL: "http://127.0.0.1:1", http: http.DefaultClient}
	if l, err := c.Buscar(context.Background(), "123"); l != nil || err != nil {
		t.Fatal("CEP com menos de 8 dígitos deve sair antes da rede")
	}
}

func TestCEPNaoEncontrado(t *testing.T) {
	c := servidor(t, 404, `{}`)
	if l, _ := c.Buscar(context.Background(), "00000000"); l != nil {
		t.Fatal("404 deve devolver nil")
	}
}

func TestCEPRedeForaNaoDerrubaOFluxo(t *testing.T) {
	c := &CEP{BaseURL: "http://127.0.0.1:1", http: http.DefaultClient}
	if l, err := c.Buscar(context.Background(), "22250040"); l != nil || err != nil {
		t.Fatalf("rede fora deve devolver nil,nil — veio %v %v", l, err)
	}
}
