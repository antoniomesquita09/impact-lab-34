// Package prep lê os dados brutos da SME, agrega por unidade, calibra o modelo
// de probabilidade e grava tudo no Postgres. Roda uma vez por ano, fora do runtime.
package prep

import (
	"compress/gzip"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

// Opcao é uma opção de creche escolhida por uma família (grão da Query A).
type Opcao struct {
	Ano, Opcao                                     int
	Unidade, Grupamento, Horario, Bairro, Situacao string
}

// Coord é uma unidade escolar georreferenciada (xlsx Unidades_Unificadas_com_Localizacao).
type Coord struct {
	Cod, Nome, Bairro, Tipo string
	CRE                     int
	Lat, Lon                float64
}

// ChaveUnidade normaliza o código da unidade para casar com DESIGNACAO do xlsx.
// A junção direta casa só 150 de 872; sem os zeros à esquerda casa 872.
func ChaveUnidade(u string) string { return strings.TrimLeft(strings.TrimSpace(u), "0") }

// LerOpcoes percorre o CSV.gz chamando fn para cada linha. Streaming: memória constante.
func LerOpcoes(path string, fn func(Opcao)) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	r := csv.NewReader(gz)
	r.Comma = ';'
	r.LazyQuotes = true
	r.FieldsPerRecord = -1
	r.ReuseRecord = true

	head, err := r.Read()
	if err != nil {
		return err
	}
	head[0] = strings.TrimPrefix(head[0], "\ufeff") // UTF-8 BOM
	col := map[string]int{}
	for i, h := range head {
		col[strings.TrimSpace(h)] = i
	}
	for _, obrig := range []string{"ano", "opcao", "unidade", "grupamento", "horario", "bairro", "situacao"} {
		if _, ok := col[obrig]; !ok {
			return fmt.Errorf("coluna %q ausente no CSV", obrig)
		}
	}

	campo := func(rec []string, k string) string {
		i := col[k]
		if i >= len(rec) {
			return ""
		}
		return strings.TrimSpace(rec[i])
	}

	for {
		rec, err := r.Read()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		ano, _ := strconv.Atoi(campo(rec, "ano"))
		op, _ := strconv.Atoi(campo(rec, "opcao"))
		fn(Opcao{
			Ano: ano, Opcao: op,
			Unidade:    campo(rec, "unidade"),
			Grupamento: campo(rec, "grupamento"),
			Horario:    campo(rec, "horario"),
			Bairro:     campo(rec, "bairro"),
			Situacao:   campo(rec, "situacao"),
		})
	}
}

// Caixa envolvente do município do Rio, com folga. Serve de sanidade: o xlsx tem
// pelo menos uma unidade gravada com (0,0) — sem isto ela iria parar no mapa no
// golfo da Guiné. Linhas fora da caixa ficam de fora do catálogo.
const (
	latMin, latMax = -23.20, -22.70
	lonMin, lonMax = -43.90, -43.00
)

// NoRio diz se a coordenada cai dentro do município.
func NoRio(lat, lon float64) bool {
	return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax
}

// LerCoordenadas devolve as unidades com latitude/longitude válidas.
// Linhas sem coordenada numérica, ou fora do Rio, são descartadas (ficam fora do mapa).
func LerCoordenadas(path string) ([]Coord, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	rows, err := f.GetRows(f.GetSheetName(0))
	if err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("xlsx sem dados")
	}
	col := map[string]int{}
	for i, h := range rows[0] {
		col[strings.TrimSpace(h)] = i
	}

	get := func(r []string, k string) string {
		i, ok := col[k]
		if !ok || i >= len(r) {
			return ""
		}
		return strings.TrimSpace(r[i])
	}
	var out []Coord
	for _, r := range rows[1:] {
		lat, e1 := strconv.ParseFloat(strings.Replace(get(r, "LATITUDE"), ",", ".", 1), 64)
		lon, e2 := strconv.ParseFloat(strings.Replace(get(r, "LONGITUDE"), ",", ".", 1), 64)
		if e1 != nil || e2 != nil || !NoRio(lat, lon) {
			continue
		}
		cre, _ := strconv.Atoi(get(r, "CRE"))
		out = append(out, Coord{
			Cod: get(r, "DESIGNACAO"), Nome: get(r, "DENOMINACAO"), Bairro: get(r, "BAIRRO"),
			Tipo: get(r, "Tipo"), CRE: cre, Lat: lat, Lon: lon,
		})
	}
	return out, nil
}
