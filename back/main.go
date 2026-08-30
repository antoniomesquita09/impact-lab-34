package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/antoniomesquita09/impact-lab-34/back/api"
	"github.com/antoniomesquita09/impact-lab-34/back/db"
	"github.com/antoniomesquita09/impact-lab-34/back/geo"
	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
	"github.com/antoniomesquita09/impact-lab-34/back/verificacao"
)

func main() {
	ctx := context.Background()
	pool, err := db.Abrir(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	ref, err := modelo.Carregar(ctx, pool)
	if err != nil {
		log.Fatalf("dados de referência ausentes — rode `go run ./pipeline`: %v", err)
	}
	log.Printf("régua com %d perguntas · mediana %.3f", len(ref.Perguntas), ref.Mediana)

	verif := verificacao.NovoDoAmbiente("back/mocks/criterios.json")
	if verif.UsandoMock() {
		log.Print("verificação de critérios: MOCK (defina VERIFICACAO_BASE_URL e VERIFICACAO_TOKEN para a API real)")
	}

	app := &api.App{
		Pool:        pool,
		Ref:         ref,
		Verificacao: verif,
		CEP:         geo.NovoCEP(),
		Roteador:    geo.NovoRoteador(),
		AnoLetivo:   2026,
	}
	porta := os.Getenv("PORT")
	if porta == "" {
		porta = "8080"
	}
	log.Printf("ouvindo em :%s", porta)
	log.Fatal(http.ListenAndServe(":"+porta, app.Rotas()))
}
