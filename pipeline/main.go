// Pipeline anual da Matrícula Carioca.
// Roda uma vez por ano, antes do processo de matrícula:
//
//	go run ./pipeline -qa <QueryA.csv.gz> -loc <Unidades.xlsx> -ano 2025
//
// Lê os dados brutos da SME, agrega, calibra o modelo e grava no Postgres numa
// única transação. Não faz parte do runtime: o servidor nunca lê CSV.
// Com -n imprime o resultado e não escreve nada (nem precisa de DATABASE_URL).
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/antoniomesquita09/impact-lab-34/back/db"
	"github.com/antoniomesquita09/impact-lab-34/pipeline/prep"
)

func main() {
	qa := flag.String("qa", "dados/Bases IC_ ClassificadoseFila/01_QueryA_InscricoesPorAno.csv.gz", "CSV.gz de inscrições por opção")
	loc := flag.String("loc", "dados/OferecimentosEvagas/Unidades_Unificadas_com_Localizacao.xlsx", "xlsx com coordenadas das unidades")
	ano := flag.Int("ano", 2025, "ano de referência para taxa e oferta")
	cap := flag.String("cap", "dados/externos/SME_Capacidade-total-por-grupamento-11-07-2025.xlsx", "xlsx de capacidade das unidades públicas")
	mat := flag.String("mat", "dados/OferecimentosEvagas/totaalunoscreche2025.xlsx", "xlsx de matrícula das unidades públicas")
	parc := flag.String("parc", "dados/OferecimentosEvagas/Parceiras2025.xlsx", "xlsx do consolidado das creches parceiras")
	aba := flag.String("aba-parc", "MAIO -2025", "aba do consolidado das parceiras")
	seco := flag.Bool("n", false, "simulação: calcula e imprime, sem gravar no banco")
	flag.Parse()

	ctx := context.Background()
	inicio := time.Now()

	log.Printf("lendo dados brutos (ano de referência %d)…", *ano)
	uns, modelo, err := prep.Agregar(*qa, *loc, *ano)
	if err != nil {
		log.Fatalf("agregação falhou: %v", err)
	}

	comTaxa, ofertas := 0, 0
	for _, u := range uns {
		if u.TaxaRef != nil {
			comTaxa++
		}
		ofertas += len(u.Oferta)
	}
	log.Printf("%d unidades com coordenada (%d com taxa, %d combinações de oferta) · mediana da taxa %.3f",
		len(uns), comTaxa, ofertas, modelo.Mediana)
	for pos := 0; pos < 5; pos++ {
		fmt.Printf("  %dª opção  <2km %.3f  2-5km %.3f  >5km %.3f\n",
			pos+1, modelo.PBase[pos][0], modelo.PBase[pos][1], modelo.PBase[pos][2])
	}

	// Capacidade e vaga ociosa são um complemento: se qualquer das três planilhas
	// faltar ou mudar de forma, o pipeline segue sem elas e a tela mostra só a
	// probabilidade. Vaga ociosa é um número forte demais para ser adivinhado.
	linhas, err := montarCapacidade(uns, *cap, *mat, *parc, *aba)
	if err != nil {
		log.Printf("AVISO: capacidade não pôde ser calculada, seguindo sem ela: %v", err)
	}

	if *seco {
		log.Printf("simulação (-n): nada foi gravado. %s", time.Since(inicio).Round(time.Millisecond))
		return
	}

	pool, err := db.Abrir(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	log.Printf("gravando no Postgres…")
	if err := prep.Gravar(ctx, pool, uns, modelo, prep.ReguaPadrao(), linhas); err != nil {
		log.Fatalf("gravação falhou (nada foi alterado): %v", err)
	}
	log.Printf("pronto em %s", time.Since(inicio).Round(time.Millisecond))
}

// montarCapacidade lê as três planilhas de capacidade e cruza com o catálogo.
// As três fontes são externas ao repositório do desafio e têm datas diferentes;
// falha em qualquer uma devolve erro e o pipeline segue sem capacidade nenhuma,
// em vez de gravar um retrato parcial que ninguém saberia interpretar.
func montarCapacidade(uns []prep.Unidade, capPath, matPath, parcPath, aba string) ([]prep.LinhaCapacidade, error) {
	capPub, err := prep.LerCapacidadePublica(capPath)
	if err != nil {
		return nil, fmt.Errorf("capacidade pública: %w", err)
	}
	matPub, err := prep.LerMatriculaPublica(matPath)
	if err != nil {
		return nil, fmt.Errorf("matrícula pública: %w", err)
	}
	parc, err := prep.LerParceiras(parcPath, aba)
	if err != nil {
		return nil, fmt.Errorf("parceiras: %w", err)
	}

	linhas, semUnidade := prep.MontarCapacidade(uns, capPub, matPub, parc)
	certas, ociosas := 0, 0
	for _, l := range linhas {
		if !l.TurnoInferido {
			certas++
		}
		ociosas += l.Ociosas
	}
	log.Printf("capacidade: %d linhas (%d com turno certo) · %d códigos das planilhas sem unidade no catálogo, descartados",
		len(linhas), certas, semUnidade)
	log.Printf("           fontes: pública %s · parceiras %s", prep.RefCapacidadePublica, prep.RefParceiras)
	return linhas, nil
}
