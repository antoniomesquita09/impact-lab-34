package geo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func roteador(t *testing.T, status int, body string) *Roteador {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return &Roteador{BaseURL: srv.URL, http: http.DefaultClient}
}

const rotaOK = `{"code":"Ok","routes":[{"distance":6650.4,"duration":612.3,
  "geometry":{"coordinates":[[-43.49,-22.88],[-43.46,-22.885],[-43.438,-22.883]]}}]}`

func TestRotearDevolveKmMinutosEGeometria(t *testing.T) {
	r := roteador(t, 200, rotaOK)
	rt, err := r.Rotear(context.Background(), -22.888, -43.491, -22.883, -43.438, "driving")
	if err != nil || rt == nil {
		t.Fatalf("esperado rota, veio %v %v", rt, err)
	}
	if rt.Km != 6.65 {
		t.Fatalf("km = %v, esperado 6.65", rt.Km)
	}
	if rt.Minutos != 10 {
		t.Fatalf("minutos = %d, esperado 10", rt.Minutos)
	}
	if rt.Geometria == nil || len(rt.Geometria.Coordinates) != 3 {
		t.Fatalf("geometria não veio: %+v", rt.Geometria)
	}
	if rt.Geometria.Type != "LineString" {
		t.Fatalf("tipo = %q", rt.Geometria.Type)
	}
}

// Qualquer modo pedido vira driving: o OSRM público só tem o perfil de carro,
// e devolver "foot" com uma rota de carro seria mentir para a família.
func TestRotearSempreDriving(t *testing.T) {
	r := roteador(t, 200, rotaOK)
	for _, m := range []string{"foot", "bike", "teletransporte", ""} {
		rt, _ := r.Rotear(context.Background(), -22.8, -43.4, -22.9, -43.3, m)
		if rt == nil || rt.Modo != "driving" {
			t.Fatalf("modo %q → %+v", m, rt)
		}
	}
}

// Sem caminho não se inventa traçado: quem chama mostra a linha reta e diz que é.
func TestRotearSemCaminhoNaoInventa(t *testing.T) {
	r := roteador(t, 200, `{"code":"NoRoute","routes":[]}`)
	if rt, err := r.Rotear(context.Background(), -22.8, -43.4, -22.9, -43.3, "foot"); rt != nil || err != nil {
		t.Fatalf("esperado nil,nil — veio %v %v", rt, err)
	}
}

func TestRotearServicoForaNaoDerrubaOFluxo(t *testing.T) {
	r := &Roteador{BaseURL: "http://127.0.0.1:1", http: http.DefaultClient}
	if rt, err := r.Rotear(context.Background(), -22.8, -43.4, -22.9, -43.3, "driving"); rt != nil || err != nil {
		t.Fatalf("serviço fora deve devolver nil,nil — veio %v %v", rt, err)
	}
}

func TestRotearErroHTTPNaoDerruba(t *testing.T) {
	r := roteador(t, 429, `{}`)
	if rt, _ := r.Rotear(context.Background(), -22.8, -43.4, -22.9, -43.3, "driving"); rt != nil {
		t.Fatal("429 deve devolver nil")
	}
}
