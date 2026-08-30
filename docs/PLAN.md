# Matrícula Carioca — Inscrição Inteligente · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um novo fluxo de inscrição em creche onde a família entra com CPF, tem os critérios pré-validados contra o RMI e a base da SME, completa só o que falta, informa um local de referência e recebe no mapa as creches recomendadas por proximidade × probabilidade de entrar.

**Architecture:** Duas peças independentes. (1) `pipeline` — pipeline anual em Go que lê os dados brutos da SME, agrega, calibra o modelo e grava direto no Postgres numa transação; não faz parte do runtime. (2) `back` — API Go + SPA React, que só lê o Postgres. A busca geográfica é `ST_DWithin` no PostGIS; a fórmula de probabilidade fica em Go, testável e auditável.

**Tech Stack:** Go 1.25 (stdlib `net/http`, `pgx/v5`, `excelize/v2`, `bcrypt`) · Supabase (Postgres 15 + PostGIS) · Vite + React + MapLibre GL JS (`react-map-gl`) + OpenFreeMap · deploy Render.

**Spec:** `docs/superpowers/specs/2026-08-30-matricula-rio-inscricao-design.md`

## Global Constraints

- Primeiro commit **depois das 9h de 30/08/2026**; repositório **público**; entrega até **16h30** por e-mail a `eventos@taicor.ai` com o número do grupo no assunto e no corpo.
- **Nenhuma credencial em commit.** `DATABASE_URL` só em env var; `.env` no `.gitignore`; `.env.example` com placeholder. Se vazar, rotacionar a senha no painel do Supabase.
- `dados/` (clone de `CIT-SME-RJ/dadoscreche`) fora do git.
- Junção unidade↔coordenada: **`strings.TrimLeft(unidade, "0") == DESIGNACAO`**. Junção direta casa só 150 de 872.
- CSVs da SME: separador `;`, UTF-8 **com BOM** (remover `"﻿"` do primeiro cabeçalho), `csv.Reader` com `LazyQuotes = true` e `FieldsPerRecord = -1`.
- Ano de referência do modelo: **2025** (`ANO_REF`). Ano letivo alvo: **2026**.
- Régua 2025 (`id → pontos`): `28:51, 31:25, 17:4, 20:4, 25:3, 18:3, 6:2, 16:2, 12:2, 23:2, 27:2, 29:0(desempate), 30:0(desempate)`. Soma 100.
- Probabilidade: `p = clamp(p_base[posicao][faixa] * fator, 0.02, 0.95)`, `fator = clamp(taxa_ref/mediana, 0.5, 1.6)`, `fator = 1.0` se `n_ref < 20`. Faixas de km: `[0,2)`, `[2,5)`, `[5,∞)`. **A pontuação social não entra em `p`** — em 2025 quem pontua e quem não pontua entra na mesma taxa (67,7%). O README diz isso.
- Interface em português, sentence case, sem jargão de sistema ("verificado pela Prefeitura", nunca "validado via RMI").
- Verificação de critérios por CPF: usar **`back/verificacao`** (já implementado). Não criar outro cliente de RMI.
- Modelos Claude: Sonnet por padrão; Opus só para destravar.

## Estrutura de arquivos

```
impact-lab-34/                     um go.mod só na raiz — pipeline/ e back/ compartilham modelo/ e db/
├── go.mod  go.sum  .gitignore  .env.example  README.md  render.yaml
├── schema.sql                     DDL completo (roda uma vez no Supabase)
├── docs/                          PLAN.md, camadas-de-verificacao.md
├── pipeline/                      ingestão anual: brutos → Supabase        go run ./pipeline
│   ├── main.go
│   └── prep/leitura.go            csv.gz e xlsx → structs                 (+ _test)
│       prep/calibra.go            agrega taxas e matriz 5×3               (+ _test)
│       prep/grava.go              escreve no Postgres em transação
├── back/                          API + serve front/dist                  go run ./back
│   ├── main.go
│   ├── db/db.go                   pool pgx
│   ├── modelo/modelo.go           tipos + carga da régua/modelo do banco  (+ _test)
│   ├── verificacao/verificacao.go critérios por CPF: mock/API real        (+ _test)  ✅ PRONTO
│   ├── mocks/criterios.json       fixtures da verificação por CPF (+ README)          ✅ PRONTO
│   ├── geo/cep.go                 BrasilAPI (base URL injetável)          (+ _test)
│   ├── recomenda/recomenda.go     fórmula de probabilidade + ranking      (+ _test)
│   └── api/
│       ├── router.go              mux, /api/health, SPA fallback
│       ├── auth.go                registrar/entrar/eu + middleware        (+ _test)
│       └── inscricao.go           preparar/respostas/referencia/…         (+ _test)
└── front/                         Vite + React + MapLibre                 cd front && npm run dev
    ├── package.json  vite.config.js  index.html
    └── src/{main.jsx,api.js,App.jsx,styles.css,pages/*.jsx}
```

---

### Task 0: Supabase, esquema e esqueleto Go

**Files:**
- Create: `go.mod`, `.gitignore`, `.env.example`, `schema.sql`, `back/db/db.go`

- [ ] **Step 1: Criar o projeto no Supabase**

No painel: novo projeto, região **East US (North Virginia)** (mesma do Render, menor latência). Guardar a senha do banco. Em *Project Settings → Database → Connection string → URI*, copiar a string do **Session pooler** (porta 5432, compatível com IPv4). Formato:
`postgresql://postgres.<ref>:<senha>@aws-0-us-east-1.pooler.supabase.com:5432/postgres`

- [x] **Step 2: Esqueleto**

```bash
# o repositório já existe e está clonado em impact-lab-34/ (go.mod na raiz, back/verificacao pronto)
cd impact-lab-34
mkdir -p pipeline/prep back/{db,modelo,api,rmi,geo,recomenda} front
ln -s ../dados dados                      # dados/ está no .gitignore
go get github.com/jackc/pgx/v5/pgxpool github.com/xuri/excelize/v2 golang.org/x/crypto/bcrypt
```

- [x] **Step 3: `schema.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------- referência: escrito pelo pipeline anual ----------
CREATE TABLE IF NOT EXISTS unidades (
  cod       text PRIMARY KEY,
  nome      text NOT NULL,
  bairro    text,
  cre       int,
  tipo      text,
  geom      geography(Point,4326) NOT NULL,
  taxa_ref  double precision,      -- taxa de confirmação no ano de referência
  n_ref     int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS unidades_geom_idx ON unidades USING GIST (geom);

CREATE TABLE IF NOT EXISTS unidade_oferta (
  cod        text NOT NULL REFERENCES unidades(cod) ON DELETE CASCADE,
  grupamento text NOT NULL,
  horario    text NOT NULL,
  PRIMARY KEY (cod, grupamento, horario)
);

CREATE TABLE IF NOT EXISTS perguntas (
  id        int PRIMARY KEY,
  texto     text NOT NULL,
  pontos    int  NOT NULL,
  desempate boolean NOT NULL DEFAULT false,
  validavel boolean NOT NULL DEFAULT false,
  ordem     int  NOT NULL
);

CREATE TABLE IF NOT EXISTS modelo_prob (
  posicao int NOT NULL CHECK (posicao BETWEEN 1 AND 5),
  faixa   int NOT NULL CHECK (faixa BETWEEN 0 AND 2),
  p       double precision NOT NULL,
  PRIMARY KEY (posicao, faixa)
);

CREATE TABLE IF NOT EXISTS modelo_meta (chave text PRIMARY KEY, valor text NOT NULL);

-- ---------- runtime ----------
CREATE TABLE IF NOT EXISTS contas (
  cpf        text PRIMARY KEY,
  nome       text NOT NULL,
  nascimento date,
  senha_hash text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessoes (
  token     text PRIMARY KEY,
  cpf       text NOT NULL REFERENCES contas(cpf) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inscricoes (
  cpf           text PRIMARY KEY REFERENCES contas(cpf) ON DELETE CASCADE,
  respostas     jsonb NOT NULL DEFAULT '{}'::jsonb,
  prevalidadas  jsonb NOT NULL DEFAULT '{}'::jsonb,
  score         int,
  ref           geography(Point,4326),
  ref_texto     text,
  grupamento    text,
  horario       text,
  opcoes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
```

Aplicar: colar no **SQL Editor** do Supabase e rodar. Conferir em *Table Editor* que as 8 tabelas existem.

- [x] **Step 4: `back/db/db.go`**

```go
package db

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Abrir(ctx context.Context) (*pgxpool.Pool, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return nil, fmt.Errorf("DATABASE_URL não definida — copie .env.example e preencha")
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL inválida: %w", err)
	}
	cfg.MaxConns = 8
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("não conectou no Postgres: %w", err)
	}
	return pool, nil
}
```

- [ ] **Step 5: Verificar conexão e commitar**

```bash
export DATABASE_URL='...'   # nunca commitar
cat > /tmp/ping.go <<'EOF'
package main
import ("context";"fmt";"github.com/antoniomesquita09/impact-lab-34/back/db")
func main(){ p,err:=db.Abrir(context.Background()); if err!=nil{panic(err)}; defer p.Close(); fmt.Println("ok") }
EOF
go run /tmp/ping.go   # espera: ok
git add -A && git commit -m "chore: esqueleto Go, esquema Postgres/PostGIS e conexão"
```

---

### Task 1: Leitura dos dados brutos — `pipeline/prep/leitura.go`

**Files:**
- Create: `pipeline/prep/leitura.go`, `pipeline/prep/leitura_test.go`

**Interfaces:**
- Produces:
  - `type Opcao struct { Ano, Opcao int; Unidade, Grupamento, Horario, Bairro, Situacao string }`
  - `type Coord struct { Cod, Nome, Bairro, Tipo string; CRE int; Lat, Lon float64 }`
  - `LerOpcoes(path string, fn func(Opcao)) error` — streaming, não carrega tudo na memória.
  - `LerCoordenadas(path string) ([]Coord, error)`
  - `ChaveUnidade(u string) string` → `strings.TrimLeft(u, "0")`

- [ ] **Step 1: Teste**

```go
// pipeline/prep/leitura_test.go
package prep

import "testing"

const QA = "../../dados/Bases IC_ ClassificadoseFila/01_QueryA_InscricoesPorAno.csv.gz"
const LOC = "../../dados/OferecimentosEvagas/Unidades_Unificadas_com_Localizacao.xlsx"

func TestLerOpcoes(t *testing.T) {
	n, confirmados := 0, 0
	unid2025 := map[string]bool{}
	err := LerOpcoes(QA, func(o Opcao) {
		n++
		if o.Situacao == "Confirmado" { confirmados++ }
		if o.Ano == 2025 { unid2025[o.Unidade] = true }
	})
	if err != nil { t.Fatal(err) }
	if n != 837179 { t.Fatalf("linhas = %d, esperado 837179", n) }
	if confirmados != 192570 { t.Fatalf("confirmados = %d, esperado 192570", confirmados) }
	if len(unid2025) != 836 { t.Fatalf("unidades 2025 = %d, esperado 836", len(unid2025)) }
}

func TestLerCoordenadasEJuncao(t *testing.T) {
	cs, err := LerCoordenadas(LOC)
	if err != nil { t.Fatal(err) }
	if len(cs) != 1941 { t.Fatalf("coordenadas = %d, esperado 1941", len(cs)) }
	porCod := map[string]bool{}
	for _, c := range cs {
		porCod[c.Cod] = true
		if c.Lat > -22.7 || c.Lat < -23.2 || c.Lon > -43.0 || c.Lon < -43.9 {
			t.Fatalf("coordenada fora do Rio: %+v", c)
		}
	}
	if !porCod[ChaveUnidade("0430809")] { t.Fatal("0430809 deveria casar via TrimLeft") }
}
```

- [ ] **Step 2: Rodar — deve falhar** — `go test ./pipeline/prep/ -run TestLer -v` → não compila.

- [ ] **Step 3: Implementar**

```go
// pipeline/prep/leitura.go
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

type Opcao struct {
	Ano, Opcao                                     int
	Unidade, Grupamento, Horario, Bairro, Situacao string
}

type Coord struct {
	Cod, Nome, Bairro, Tipo string
	CRE                     int
	Lat, Lon                float64
}

// ChaveUnidade normaliza o código da unidade para casar com DESIGNACAO do xlsx.
func ChaveUnidade(u string) string { return strings.TrimLeft(strings.TrimSpace(u), "0") }

// LerOpcoes percorre o CSV.gz chamando fn para cada linha. Streaming: memória constante.
func LerOpcoes(path string, fn func(Opcao)) error {
	f, err := os.Open(path)
	if err != nil { return err }
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil { return err }
	defer gz.Close()

	r := csv.NewReader(gz)
	r.Comma = ';'
	r.LazyQuotes = true
	r.FieldsPerRecord = -1

	head, err := r.Read()
	if err != nil { return err }
	head[0] = strings.TrimPrefix(head[0], "﻿") // UTF-8 BOM
	col := map[string]int{}
	for i, h := range head { col[strings.TrimSpace(h)] = i }
	for _, obrig := range []string{"ano", "opcao", "unidade", "grupamento", "horario", "bairro", "situacao"} {
		if _, ok := col[obrig]; !ok { return fmt.Errorf("coluna %q ausente no CSV", obrig) }
	}

	for {
		rec, err := r.Read()
		if err == io.EOF { return nil }
		if err != nil { return err }
		ano, _ := strconv.Atoi(rec[col["ano"]])
		op, _ := strconv.Atoi(rec[col["opcao"]])
		fn(Opcao{
			Ano: ano, Opcao: op,
			Unidade:    strings.TrimSpace(rec[col["unidade"]]),
			Grupamento: strings.TrimSpace(rec[col["grupamento"]]),
			Horario:    strings.TrimSpace(rec[col["horario"]]),
			Bairro:     strings.TrimSpace(rec[col["bairro"]]),
			Situacao:   strings.TrimSpace(rec[col["situacao"]]),
		})
	}
}

func LerCoordenadas(path string) ([]Coord, error) {
	f, err := excelize.OpenFile(path)
	if err != nil { return nil, err }
	defer f.Close()
	rows, err := f.GetRows(f.GetSheetName(0))
	if err != nil { return nil, err }
	if len(rows) < 2 { return nil, fmt.Errorf("xlsx sem dados") }
	col := map[string]int{}
	for i, h := range rows[0] { col[strings.TrimSpace(h)] = i }

	get := func(r []string, k string) string {
		i, ok := col[k]
		if !ok || i >= len(r) { return "" }
		return strings.TrimSpace(r[i])
	}
	var out []Coord
	for _, r := range rows[1:] {
		lat, e1 := strconv.ParseFloat(get(r, "LATITUDE"), 64)
		lon, e2 := strconv.ParseFloat(get(r, "LONGITUDE"), 64)
		if e1 != nil || e2 != nil { continue }
		cre, _ := strconv.Atoi(get(r, "CRE"))
		out = append(out, Coord{
			Cod: get(r, "DESIGNACAO"), Nome: get(r, "DENOMINACAO"), Bairro: get(r, "BAIRRO"),
			Tipo: get(r, "Tipo"), CRE: cre, Lat: lat, Lon: lon,
		})
	}
	return out, nil
}
```

- [ ] **Step 4: `go test ./pipeline/prep/ -run TestLer -v` → PASS** (leva ~3 s)
- [ ] **Step 5: Commit** — `git add pipeline/prep && git commit -m "feat(prep): leitura streaming do CSV.gz e do xlsx de coordenadas"`

---

### Task 2: Agregação e calibração — `pipeline/prep/calibra.go`

**Files:**
- Create: `pipeline/prep/calibra.go`, `pipeline/prep/calibra_test.go`

**Interfaces:**
- Produces:
  - `type Unidade struct { Cod, Nome, Bairro, Tipo string; CRE int; Lat, Lon float64; TaxaRef *float64; NRef int; Oferta []OfertaItem }`
  - `type OfertaItem struct { Grupamento, Horario string }`
  - `type Modelo struct { PBase [5][3]float64; Mediana float64; CalibradoEm string }`
  - `Agregar(qaPath, locPath string, anoRef int) ([]Unidade, Modelo, error)`
  - `Faixa(km float64) int` — `0` se `<2`, `1` se `<5`, senão `2`.
  - `HaversineKm(lat1, lon1, lat2, lon2 float64) float64`

A distância na calibração é da unidade ao **centróide do bairro do responsável** (média das coordenadas das unidades daquele bairro) — proxy grosseira, declarada no README. Em produção, a coordenada real vem do RMI ou do CEP.

- [ ] **Step 1: Teste**

```go
// pipeline/prep/calibra_test.go
package prep

import (
	"math"
	"testing"
)

func TestHaversineEFaixa(t *testing.T) {
	if d := HaversineKm(-22.9, -43.2, -22.9, -43.2); d > 1e-9 { t.Fatalf("mesma coordenada = %f", d) }
	if d := HaversineKm(-22.900, -43.200, -22.960, -43.200); math.Abs(d-6.67) > 0.15 {
		t.Fatalf("6.67 km esperado, veio %f", d)
	}
	if Faixa(1.9) != 0 || Faixa(2.0) != 1 || Faixa(4.9) != 1 || Faixa(5.0) != 2 {
		t.Fatal("limites de faixa errados")
	}
}

func TestAgregar(t *testing.T) {
	uns, m, err := Agregar(QA, LOC, 2025)
	if err != nil { t.Fatal(err) }
	if len(uns) < 800 || len(uns) > 880 { t.Fatalf("unidades = %d", len(uns)) }

	// matriz monotônica: mais longe confirma menos; opção mais tardia confirma menos
	for pos := 0; pos < 5; pos++ {
		if !(m.PBase[pos][0] >= m.PBase[pos][1] && m.PBase[pos][1] >= m.PBase[pos][2]) {
			t.Fatalf("posição %d não decresce com a distância: %v", pos+1, m.PBase[pos])
		}
	}
	if m.PBase[0][0] <= m.PBase[4][0] { t.Fatal("1ª opção deveria superar a 5ª") }
	if m.PBase[0][0] < 0.35 || m.PBase[0][0] > 0.45 { t.Fatalf("p_base[1][<2km] = %f, esperado ~0.40", m.PBase[0][0]) }
	if m.Mediana < 0.20 || m.Mediana > 0.50 { t.Fatalf("mediana = %f", m.Mediana) }

	comOferta, comTaxa := 0, 0
	for _, u := range uns {
		if len(u.Oferta) > 0 { comOferta++ }
		if u.TaxaRef != nil {
			comTaxa++
			if *u.TaxaRef < 0 || *u.TaxaRef > 1 { t.Fatalf("taxa fora de [0,1]: %f", *u.TaxaRef) }
		}
	}
	if comOferta < 700 || comTaxa < 700 { t.Fatalf("oferta=%d taxa=%d", comOferta, comTaxa) }
}
```

- [ ] **Step 2: Rodar — falha**

- [ ] **Step 3: Implementar**

```go
// pipeline/prep/calibra.go
package prep

import (
	"math"
	"sort"
	"strings"
)

type OfertaItem struct{ Grupamento, Horario string }

type Unidade struct {
	Cod, Nome, Bairro, Tipo string
	CRE                     int
	Lat, Lon                float64
	TaxaRef                 *float64
	NRef                    int
	Oferta                  []OfertaItem
}

type Modelo struct {
	PBase       [5][3]float64
	Mediana     float64
	CalibradoEm string
}

func HaversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	rad := func(d float64) float64 { return d * math.Pi / 180 }
	dlat, dlon := rad(lat2-lat1), rad(lon2-lon1)
	a := math.Sin(dlat/2)*math.Sin(dlat/2) +
		math.Cos(rad(lat1))*math.Cos(rad(lat2))*math.Sin(dlon/2)*math.Sin(dlon/2)
	return R * 2 * math.Asin(math.Sqrt(a))
}

func Faixa(km float64) int {
	switch {
	case km < 2:
		return 0
	case km < 5:
		return 1
	default:
		return 2
	}
}

func normalizaBairro(s string) string { return strings.ToUpper(strings.TrimSpace(s)) }

type contador struct{ conf, tot int }

// Agregar lê os brutos uma única vez e devolve as unidades enriquecidas e o modelo calibrado.
func Agregar(qaPath, locPath string, anoRef int) ([]Unidade, Modelo, error) {
	coords, err := LerCoordenadas(locPath)
	if err != nil { return nil, Modelo{}, err }
	porChave := map[string]Coord{}
	for _, c := range coords { porChave[c.Cod] = c }

	// centróide de bairro a partir das unidades (proxy da posição da família)
	type soma struct{ lat, lon float64; n int }
	somaBairro := map[string]*soma{}
	for _, c := range coords {
		b := normalizaBairro(c.Bairro)
		if b == "" { continue }
		s := somaBairro[b]
		if s == nil { s = &soma{}; somaBairro[b] = s }
		s.lat += c.Lat; s.lon += c.Lon; s.n++
	}
	centroide := map[string][2]float64{}
	for b, s := range somaBairro { centroide[b] = [2]float64{s.lat / float64(s.n), s.lon / float64(s.n)} }

	taxaUnid := map[string]*contador{}                 // ano de referência
	oferta := map[string]map[OfertaItem]bool{}         // ano de referência
	vistas := map[string]bool{}                        // qualquer ano, para o catálogo
	var matriz [5][3]contador                          // todos os anos, para a calibração

	err = LerOpcoes(qaPath, func(o Opcao) {
		vistas[o.Unidade] = true
		if o.Ano == anoRef {
			c := taxaUnid[o.Unidade]
			if c == nil { c = &contador{}; taxaUnid[o.Unidade] = c }
			c.tot++
			if o.Situacao == "Confirmado" { c.conf++ }
			if o.Grupamento != "" && o.Horario != "" {
				m := oferta[o.Unidade]
				if m == nil { m = map[OfertaItem]bool{}; oferta[o.Unidade] = m }
				m[OfertaItem{o.Grupamento, o.Horario}] = true
			}
		}
		if o.Opcao < 1 || o.Opcao > 5 { return }
		cd, ok := porChave[ChaveUnidade(o.Unidade)]
		if !ok { return }
		cen, ok := centroide[normalizaBairro(o.Bairro)]
		if !ok { return }
		f := Faixa(HaversineKm(cen[0], cen[1], cd.Lat, cd.Lon))
		cell := &matriz[o.Opcao-1][f]
		cell.tot++
		if o.Situacao == "Confirmado" { cell.conf++ }
	})
	if err != nil { return nil, Modelo{}, err }

	var m Modelo
	m.CalibradoEm = "2021-2025"
	for pos := 0; pos < 5; pos++ {
		for f := 0; f < 3; f++ {
			if c := matriz[pos][f]; c.tot > 0 {
				m.PBase[pos][f] = float64(c.conf) / float64(c.tot)
			}
		}
	}

	var unidades []Unidade
	var taxas []float64
	for cod := range vistas {
		cd, ok := porChave[ChaveUnidade(cod)]
		if !ok { continue } // sem coordenada: fica de fora do mapa
		u := Unidade{Cod: cod, Nome: cd.Nome, Bairro: cd.Bairro, Tipo: cd.Tipo, CRE: cd.CRE, Lat: cd.Lat, Lon: cd.Lon}
		if c := taxaUnid[cod]; c != nil && c.tot > 0 {
			t := float64(c.conf) / float64(c.tot)
			u.TaxaRef, u.NRef = &t, c.tot
			if c.tot >= 50 { taxas = append(taxas, t) }
		}
		for item := range oferta[cod] { u.Oferta = append(u.Oferta, item) }
		sort.Slice(u.Oferta, func(i, j int) bool {
			if u.Oferta[i].Grupamento != u.Oferta[j].Grupamento { return u.Oferta[i].Grupamento < u.Oferta[j].Grupamento }
			return u.Oferta[i].Horario < u.Oferta[j].Horario
		})
		unidades = append(unidades, u)
	}
	sort.Slice(unidades, func(i, j int) bool { return unidades[i].Cod < unidades[j].Cod })

	sort.Float64s(taxas)
	if n := len(taxas); n > 0 {
		if n%2 == 1 { m.Mediana = taxas[n/2] } else { m.Mediana = (taxas[n/2-1] + taxas[n/2]) / 2 }
	}
	return unidades, m, nil
}
```

- [ ] **Step 4: `go test ./pipeline/prep/ -v` → PASS**
- [ ] **Step 5: Commit** — `git add pipeline/prep && git commit -m "feat(prep): agregação por unidade e calibração da matriz 5x3"`

---

### Task 3: Gravação no Postgres + `pipeline`

**Files:**
- Create: `pipeline/prep/grava.go`, `pipeline/main.go`

**Interfaces:**
- Consumes: Task 2.
- Produces: `Gravar(ctx, pool *pgxpool.Pool, uns []Unidade, m Modelo, perguntas []Pergunta) error` — idempotente, numa transação.
- Produces: `type Pergunta struct { ID, Pontos, Ordem int; Texto string; Desempate, Validavel bool }` e `ReguaPadrao() []Pergunta` (a régua 2025).

- [ ] **Step 1: `pipeline/prep/grava.go`**

```go
package prep

import (
	"context"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Pergunta struct {
	ID, Pontos, Ordem int
	Texto             string
	Desempate         bool
	Validavel         bool
}

// ReguaPadrao é a régua do processo 2025 (prm_id 195). Soma 100 pontos.
func ReguaPadrao() []Pergunta {
	return []Pergunta{
		{28, 51, 1, "A família da criança está inscrita no CadÚnico?", false, true},
		{31, 25, 2, "A criança é público-alvo da educação especial?", false, false},
		{17, 4, 3, "A criança ou alguém do convívio diário é vítima de violência doméstica?", false, false},
		{20, 4, 4, "A criança pertence a família monoparental?", false, false},
		{25, 3, 5, "Os pais ou responsáveis têm deficiência?", false, true},
		{18, 3, 6, "A criança ou alguém da família tem doença crônica grave?", false, false},
		{6, 2, 7, "A família recebe Bolsa Família ou tem Cartão Carioca?", false, false},
		{16, 2, 8, "Alguém da família faz uso abusivo de álcool ou drogas?", false, false},
		{12, 2, 9, "Alguém da família esteve preso nos últimos 5 anos?", false, false},
		{23, 2, 10, "A criança é refugiada?", false, false},
		{27, 2, 11, "A criança aguardou na fila de espera no ano passado sem ser atendida?", false, true},
		{29, 0, 12, "A criança tem irmão matriculado na rede pública ou parceira?", true, true},
		{30, 0, 13, "Os pais ou responsáveis têm menos de 18 anos?", true, true},
	}
}

// Gravar substitui todos os dados de referência numa única transação.
func Gravar(ctx context.Context, pool *pgxpool.Pool, uns []Unidade, m Modelo, perguntas []Pergunta) error {
	tx, err := pool.Begin(ctx)
	if err != nil { return err }
	defer tx.Rollback(ctx)

	for _, q := range []string{
		"TRUNCATE unidade_oferta", "TRUNCATE unidades CASCADE",
		"TRUNCATE perguntas", "TRUNCATE modelo_prob", "TRUNCATE modelo_meta",
	} {
		if _, err := tx.Exec(ctx, q); err != nil { return fmt.Errorf("%s: %w", q, err) }
	}

	rowsU := make([][]any, 0, len(uns))
	rowsO := make([][]any, 0, len(uns)*4)
	for _, u := range uns {
		rowsU = append(rowsU, []any{u.Cod, u.Nome, u.Bairro, u.CRE, u.Tipo, u.Lon, u.Lat, u.TaxaRef, u.NRef})
		for _, o := range u.Oferta {
			rowsO = append(rowsO, []any{u.Cod, o.Grupamento, o.Horario})
		}
	}
	// CopyFrom não aceita expressão; insere lon/lat em colunas temporárias via INSERT em lote
	for _, r := range rowsU {
		_, err := tx.Exec(ctx, `INSERT INTO unidades (cod,nome,bairro,cre,tipo,geom,taxa_ref,n_ref)
			VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_MakePoint($6,$7),4326)::geography, $8,$9)`,
			r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8])
		if err != nil { return fmt.Errorf("insert unidade %v: %w", r[0], err) }
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"unidade_oferta"},
		[]string{"cod", "grupamento", "horario"}, pgx.CopyFromRows(rowsO)); err != nil {
		return fmt.Errorf("copy oferta: %w", err)
	}

	rowsQ := make([][]any, 0, len(perguntas))
	for _, q := range perguntas {
		rowsQ = append(rowsQ, []any{q.ID, q.Texto, q.Pontos, q.Desempate, q.Validavel, q.Ordem})
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"perguntas"},
		[]string{"id", "texto", "pontos", "desempate", "validavel", "ordem"}, pgx.CopyFromRows(rowsQ)); err != nil {
		return fmt.Errorf("copy perguntas: %w", err)
	}

	for pos := 0; pos < 5; pos++ {
		for f := 0; f < 3; f++ {
			if _, err := tx.Exec(ctx, `INSERT INTO modelo_prob (posicao,faixa,p) VALUES ($1,$2,$3)`,
				pos+1, f, m.PBase[pos][f]); err != nil { return err }
		}
	}
	for k, v := range map[string]string{
		"mediana_taxa_ref": strconv.FormatFloat(m.Mediana, 'f', 6, 64),
		"calibrado_em":     m.CalibradoEm,
	} {
		if _, err := tx.Exec(ctx, `INSERT INTO modelo_meta (chave,valor) VALUES ($1,$2)`, k, v); err != nil { return err }
	}
	return tx.Commit(ctx)
}
```

- [ ] **Step 2: `pipeline/main.go`**

```go
// Pipeline anual da Matrícula Carioca.
// Roda uma vez por ano, antes do processo de matrícula:
//   go run ./pipeline -qa <QueryA.csv.gz> -loc <Unidades.xlsx> -ano 2025
// Lê os dados brutos da SME, agrega, calibra o modelo e grava no Postgres.
// Não faz parte do runtime: o servidor nunca lê CSV.
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
	flag.Parse()

	ctx := context.Background()
	inicio := time.Now()

	log.Printf("lendo dados brutos (ano de referência %d)…", *ano)
	uns, modelo, err := prep.Agregar(*qa, *loc, *ano)
	if err != nil { log.Fatalf("agregação falhou: %v", err) }
	log.Printf("%d unidades com coordenada · mediana da taxa %.3f", len(uns), modelo.Mediana)
	for pos := 0; pos < 5; pos++ {
		fmt.Printf("  %dª opção  <2km %.3f  2-5km %.3f  >5km %.3f\n",
			pos+1, modelo.PBase[pos][0], modelo.PBase[pos][1], modelo.PBase[pos][2])
	}

	pool, err := db.Abrir(ctx)
	if err != nil { log.Fatal(err) }
	defer pool.Close()

	log.Printf("gravando no Postgres…")
	if err := prep.Gravar(ctx, pool, uns, modelo, prep.ReguaPadrao()); err != nil {
		log.Fatalf("gravação falhou (nada foi alterado): %v", err)
	}
	log.Printf("pronto em %s", time.Since(inicio).Round(time.Millisecond))
}
```

- [ ] **Step 3: Rodar o pipeline**

```bash
export DATABASE_URL='...'
go run ./pipeline
```
Esperado: ~820 unidades, mediana ≈ 0,34, `1ª opção <2km ≈ 0.403`. Conferir no SQL Editor:
```sql
SELECT count(*) FROM unidades;                     -- ~820
SELECT count(*) FROM unidade_oferta;               -- alguns milhares
SELECT * FROM modelo_prob ORDER BY posicao, faixa; -- 15 linhas
SELECT * FROM modelo_meta;
```

- [ ] **Step 4: Rodar de novo** — tem que dar o mesmo resultado, sem duplicar (idempotência).
- [ ] **Step 5: Commit** — `git add pipeline/prep pipeline && git commit -m "feat(prep): pipeline anual grava dados de referência no Postgres"`

---

### Task 3B (OPCIONAL — só se sobrar tempo): capacidade e vaga ociosa real

**Por que existe:** o modelo funciona sem isto. Mas com estas fontes dá para mostrar na tela
**vagas ociosas reais por unidade e grupamento**, em vez de só uma probabilidade — o que é
muito mais concreto para a família e reproduz, com fonte oficial dos dois lados, o número que
o briefing cita: **~8.100 vagas ociosas com fila aberta** (públicas 53.432 − 46.975 = 6.457;
parceiras 1.665). Levantado pela sessão irmã e conferido aqui: a junção casa 488/488.

**Files:**
- Modify: `schema.sql` (tabela nova), `pipeline/prep/leitura.go`, `pipeline/prep/calibra.go`, `pipeline/prep/grava.go`
- Modify: `back/recomenda/recomenda.go` (expor `VagasOciosas` na `Sugestao`)

**Fontes** (a primeira **não** vem do repositório do desafio — foi baixada da Transparência–Creches
da SME, https://educacao.prefeitura.rio/transparenciacreches/, e vive em `dados/externos/`):

| Arquivo | O que traz | Junção |
|---|---|---|
| `dados/externos/SME_Capacidade-total-por-grupamento-11-07-2025.xlsx` | 488 unidades públicas; colunas `Designação, Denominacao, Berçário, Maternal I, Maternal II, Total Geral` | `ChaveUnidade(unidade) == lstrip0(Designação)` — **488/488** |
| `dados/OferecimentosEvagas/totaalunoscreche2025.xlsx` (aba `Consolidado`) | matrícula pública: 46.975 alunos, por grupamento × turno | 488/488 com a capacidade |
| `dados/OferecimentosEvagas/Parceiras2025.xlsx` (aba `MAIO -2025`) | 347 parceiras; `Meta` (capacidade), `Aluno` (matriculados), `Vagas` (ociosas, já calculadas pela SME) | `CÓDIGO SGA` com **4 dígitos** → precisa de `zfill(5)` para casar |

**Armadilhas — todas verificadas:**
- A aba `MAIO -2025` tem **cabeçalho em duas linhas** (grupamento na primeira, `Meta`/`Aluno`/`Vagas` na segunda). Ler com `GetRows` e montar o mapa de colunas a partir das duas primeiras linhas, propagando o grupamento para a direita.
- **`zfill(5)` no código das parceiras**, senão a junção devolve zero. (Do lado público não precisa: `ChaveUnidade` resolve. Testado sobre as 872 unidades distintas da Query A — **872 chaves distintas, zero colisões**, nenhuma vazia; uma parceira `01004` não colide com nenhuma pública após o `ltrim`.)
- **Tipos nas células (verificado com openpyxl, célula crua):** nas duas planilhas públicas a `Designação` é **texto com os zeros preservados** — `'0101601'` na capacidade e `'0101001'` no `totaalunoscreche`. Só o `CÓDIGO SGA` das parceiras é **numérico de verdade** (`1004`, int), e é por isso que só ele precisa de `zfill(5)`. Ainda assim, passe as três por `ChaveUnidade`: a camada de leitura (pandas, excelize) converte célula que "parece número" sem avisar, e aí os zeros somem. Normalizar sempre custa nada e evita caçar um problema que não existe no arquivo.
- Na aba `MAIO -2025`, a **linha 1 é vazia** e o cabeçalho começa na **linha 2** (`CRE`, `CÓDIGO SGA`, `Denominação SGA`, `Grupamentos autorizados`); os dados começam na linha 3.
- A aba `Consolidado` do `totaalunoscreche2025.xlsx` também tem **cabeçalho de duas linhas**: linha 0 = turno (Integral/Parcial), linha 1 = campo (Aluno/Turma), dados a partir da linha 2. Colunas de Aluno por índice: Berçário 3/5 · Maternal I 7/9 · Maternal II 11/13 (integral/parcial).
- **18 unidades públicas têm matrícula acima da capacidade** (turmas com exceção autorizada). Calcular ociosidade com **piso em zero**, senão aparecem negativos na tela.
- **5 parceiras sem linha em maio/2025**: `11010, 06018, 08017, 08022, 05009`. Ficam sem capacidade — não invente número para elas.
- As três fontes têm **datas diferentes** (capacidade pública 11/07/2025; meta das parceiras maio/2025; matrícula pública é dinâmica). Isso **tem que aparecer na interface**, não ficar escondido: "vagas ociosas conforme a SME em julho/2025".
- Fallback `turmas × 25` (módulo da Resolução SME 360/2022) só serve para agregado: erra +3,3% no total mas tem **p90 de 20% de erro por unidade**. Não usar para decisão unidade a unidade; se usar, marcar como estimado na tela.

- [ ] **Step 1: Tabela no `schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS unidade_capacidade (
  cod            text NOT NULL REFERENCES unidades(cod) ON DELETE CASCADE,
  grupamento     text NOT NULL,
  turno          text NOT NULL,          -- 'Integral' | 'Parcial'
  capacidade     int  NOT NULL,
  matriculados   int  NOT NULL,
  ociosas        int  NOT NULL,          -- greatest(capacidade - matriculados, 0)
  turno_inferido boolean NOT NULL,       -- false = unidade de turno único (certo)
  fonte          text NOT NULL,          -- 'publica' | 'parceira'
  referencia     text NOT NULL,          -- '2025-07-11' | '2025-05'
  PRIMARY KEY (cod, grupamento, turno)
);
```

**Capacidade por turno — não há fonte oficial, mas 88,4% é determinístico.** A sessão irmã varreu
a Transparência–Creches, a página de creches parceiras, o data.rio e o Censo/INEP: nenhuma publica
capacidade por turno. **Considere a busca externa fechada.** Em compensação, a rede é quase toda de
turno único, e o `totaalunoscreche2025.xlsx` já traz matrícula e turmas por grupamento × turno.
Classificando as 488 públicas pela matrícula observada (conferido aqui):

| Classe | Unidades | Vagas | % da capacidade |
|---|---:|---:|---:|
| Só Integral | 386 | 39.343 | 73,6% |
| Só Parcial | 62 | 7.895 | 14,8% |
| **Determinísticas** | **448** | **47.238** | **88,4%** |
| Mistas (precisam de rateio) | 40 | 6.194 | 11,6% |

Nas 448 de turno único a capacidade inteira vai para aquele turno, com `turno_inferido = false`.
Só as 40 mistas precisam de rateio, com `turno_inferido = true`.

**Rateie por grupamento, nunca pelo total da unidade** — o share integral cai muito com a idade.
Entre as 40 mistas: Berçário **77,1%** · Maternal I **63,8%** · Maternal II **43,6%**. Melhor ainda:
use a proporção da própria unidade naquele grupamento, e caia para esses valores agregados só quando
a unidade não tiver matrícula no grupamento. (Cuidado: na rede inteira esses shares são 88,0 / 82,0 /
76,6 — usar os da rede inflaria o integral das mistas.)

Contexto da rede: a matrícula pública é **80,8% integral** (37.956) contra 19,2% parcial (9.019).
Tratar tudo como integral erraria ~19% da matrícula — não é desprezível, mas é bem menos grave que
errar a unidade.

Na interface: onde `turno_inferido = false`, o card pode dizer "12 vagas ociosas · integral";
onde for `true`, mostre o grupamento agregado sem afirmar o turno. Não invente precisão.

- [ ] **Step 2: Leitura** — em `pipeline/prep/leitura.go`, acrescentar `LerCapacidadePublica(path string) (map[string]map[string]int, error)` (chave externa: `ChaveUnidade`; interna: grupamento → vagas) e `LerParceiras(path string) (map[string]map[string]struct{ Meta, Aluno int }, error)` aplicando `zfill(5)` no `CÓDIGO SGA`. Teste: total público = **53.432**, e `Berçário 10.626 / Maternal I 18.622 / Maternal II 24.184`.

- [ ] **Step 3: Gravação** — `TRUNCATE unidade_capacidade` dentro da mesma transação da Task 3, e `CopyFrom` das linhas, com `ociosas = max(capacidade - matriculados, 0)`.

- [ ] **Step 4: Expor na recomendação** — em `Buscar`, `LEFT JOIN unidade_capacidade c ON c.cod = u.cod AND c.grupamento = $2 AND c.turno = $3`, trazendo `c.ociosas` e `c.turno_inferido`. Em `Sugestao`, campos `VagasOciosas *int` (`json:"vagas_ociosas"`) e `TurnoInferido bool` (`json:"turno_inferido"`) — nil quando não há dado. Em `Creches.jsx`: `{r.vagas_ociosas} vagas ociosas · SME, jul/2025` quando `!turno_inferido`, e sem afirmar o turno quando `turno_inferido`.

- [ ] **Step 5: Commit** — `git commit -am "feat: capacidade e vaga ociosa real por unidade"`


---

### Task 4: Régua e modelo em memória — `back/modelo/modelo.go`

**Files:**
- Create: `back/modelo/modelo.go`, `back/modelo/modelo_test.go`

**Interfaces:**
- Produces:
  - `type Pergunta struct { ID, Pontos, Ordem int; Texto string; Desempate, Validavel bool }`
  - `type Ref struct { Perguntas []Pergunta; PBase [5][3]float64; Mediana float64 }`
  - `Carregar(ctx, pool) (*Ref, error)` — lê `perguntas`, `modelo_prob`, `modelo_meta` uma vez no boot.
  - `(*Ref) CalcularScore(respostas map[int]bool) int`
  - `GrupamentoPorNascimento(nasc time.Time, anoLetivo int) string` — corte 31/03: <2 anos Berçário, 2 Maternal I, 3+ Maternal II.

- [x] **Step 1: Teste**

```go
// back/modelo/modelo_test.go
package modelo

import (
	"testing"
	"time"
)

func refDeTeste() *Ref {
	return &Ref{Perguntas: []Pergunta{
		{ID: 28, Pontos: 51}, {ID: 31, Pontos: 25}, {ID: 20, Pontos: 4}, {ID: 29, Pontos: 0, Desempate: true},
	}}
}

func TestCalcularScore(t *testing.T) {
	r := refDeTeste()
	if got := r.CalcularScore(map[int]bool{28: true, 31: false, 20: true}); got != 55 {
		t.Fatalf("score = %d, esperado 55", got)
	}
	if got := r.CalcularScore(map[int]bool{}); got != 0 { t.Fatalf("score vazio = %d", got) }
	if got := r.CalcularScore(map[int]bool{29: true}); got != 0 { t.Fatalf("desempate não soma: %d", got) }
	if got := r.CalcularScore(map[int]bool{999: true}); got != 0 { t.Fatalf("id desconhecido: %d", got) }
}

func TestGrupamento(t *testing.T) {
	d := func(s string) time.Time { v, _ := time.Parse("2006-01-02", s); return v }
	casos := []struct{ nasc, esperado string }{
		{"2025-06-10", "Berçário"}, {"2023-11-01", "Maternal I"}, {"2022-09-15", "Maternal II"},
		{"2024-03-31", "Berçário"}, {"2024-03-30", "Maternal I"},
	}
	for _, c := range casos {
		if got := GrupamentoPorNascimento(d(c.nasc), 2026); got != c.esperado {
			t.Fatalf("%s → %s, esperado %s", c.nasc, got, c.esperado)
		}
	}
}
```

- [x] **Step 2: Rodar — falha**

- [x] **Step 3: Implementar**

```go
// back/modelo/modelo.go
package modelo

import (
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Pergunta struct {
	ID        int    `json:"id"`
	Texto     string `json:"texto"`
	Pontos    int    `json:"pontos"`
	Desempate bool   `json:"desempate"`
	Validavel bool   `json:"validavel"`
	Ordem     int    `json:"-"`
}

type Ref struct {
	Perguntas []Pergunta
	PBase     [5][3]float64
	Mediana   float64
}

func Carregar(ctx context.Context, pool *pgxpool.Pool) (*Ref, error) {
	r := &Ref{}
	rows, err := pool.Query(ctx, `SELECT id,texto,pontos,desempate,validavel,ordem FROM perguntas ORDER BY ordem`)
	if err != nil { return nil, err }
	for rows.Next() {
		var q Pergunta
		if err := rows.Scan(&q.ID, &q.Texto, &q.Pontos, &q.Desempate, &q.Validavel, &q.Ordem); err != nil { return nil, err }
		r.Perguntas = append(r.Perguntas, q)
	}
	rows.Close()

	pr, err := pool.Query(ctx, `SELECT posicao,faixa,p FROM modelo_prob`)
	if err != nil { return nil, err }
	for pr.Next() {
		var pos, f int
		var p float64
		if err := pr.Scan(&pos, &f, &p); err != nil { return nil, err }
		if pos >= 1 && pos <= 5 && f >= 0 && f <= 2 { r.PBase[pos-1][f] = p }
	}
	pr.Close()

	var med string
	if err := pool.QueryRow(ctx, `SELECT valor FROM modelo_meta WHERE chave='mediana_taxa_ref'`).Scan(&med); err != nil {
		return nil, err
	}
	r.Mediana, _ = strconv.ParseFloat(med, 64)
	return r, nil
}

func (r *Ref) CalcularScore(respostas map[int]bool) int {
	pontos := map[int]int{}
	for _, q := range r.Perguntas { pontos[q.ID] = q.Pontos }
	total := 0
	for id, sim := range respostas {
		if sim { total += pontos[id] }
	}
	return total
}

// GrupamentoPorNascimento usa o corte de 31/03 do ano letivo (premissa a confirmar com a SME).
func GrupamentoPorNascimento(nasc time.Time, anoLetivo int) string {
	corte := time.Date(anoLetivo, 3, 31, 0, 0, 0, 0, time.UTC)
	idade := corte.Year() - nasc.Year()
	if corte.Month() < nasc.Month() || (corte.Month() == nasc.Month() && corte.Day() < nasc.Day()) {
		idade--
	}
	switch {
	case idade < 2:
		return "Berçário"
	case idade == 2:
		return "Maternal I"
	default:
		return "Maternal II"
	}
}
```

- [x] **Step 4: `go test ./back/modelo/ -v` → PASS**
- [x] **Step 5: Commit** — `git add back/modelo && git commit -m "feat: carga da régua e do modelo do banco, score e grupamento"`

---

### Task 5: Verificação de critérios por CPF — ✅ JÁ IMPLEMENTADA

**Não reimplemente.** `back/verificacao/` e `back/mocks/criterios.json` já estão no repositório,
com 11 testes passando, `gofmt` e `go vet` limpos. Esta task é só conferir e seguir.

- [x] **Step 1: Conferir** — `go test ./back/verificacao/ -v` (11 PASS).
- [x] **Step 2: Ler o contrato** — `back/mocks/README.md` traz o mapeamento das 13 perguntas e os 9 CPFs de teste.

**O que ela entrega:**

```go
cli := verificacao.NovoDoAmbiente("back/mocks/criterios.json")
r, err := cli.Consultar(ctx, cpf)   // erro só se o CPF for inválido
c := r.PorPergunta()                // map[int]Criterio
c[28].Valor, c[28].Fonte, c[28].Orgao, c[28].Referencia, c[28].Confianca
r.Pessoa      // nome, nascimento, menor_idade, endereco (com lat/lon), telefone
r.Encontrado  // false = CPF válido sem registro; a família responde tudo
r.NaoVerificaveis // [17,16,12] — sensíveis, nunca vêm verificadas
```

**Cobertura da régua:** 64 dos 100 pontos com confiança **alta** (28, 6, 20, 25, 23, 27, 29, 30);
28 pontos com confiança **média**, que exigem conferência da unidade (31, 18); 8 pontos
autodeclarados (17, 16, 12) — violência, drogas, familiar preso. Nenhuma base responde esses
três no lugar da família, e há teste garantindo isso.

**Trocar pelo real:** definir `VERIFICACAO_BASE_URL` e `VERIFICACAO_TOKEN`. O cliente chama
`GET {base}/v1/criterios/{cpf}` com Bearer; 404 vira `Encontrado: false`, não erro. Só o método
`daAPI` muda se a API real tiver outro formato.

**CPFs de teste** (todos com dígito verificador válido; sequências repetidas são rejeitadas):
`100.000.000-19` Ana (score 59, caso principal, mora longe) · `100.000.001-08` Bruno (score 0,
Botafogo) · `100.000.002-80` Carla (sem endereço no cadastro) · `100.000.003-61` Daniel
(confiança média) · `100.000.004-42` Elena (refúgio) · `100.000.005-23` Fábio (responsável menor
de 18) · `100.000.006-04` Iara (Cartão Carioca sem CadÚnico) · `100.000.007-95` João (tudo
positivo, score 89) · `100.000.008-76` sem registro.

---

### Task 6: CEP — `back/geo/cep.go`

**Files:**
- Create: `back/geo/cep.go`, `back/geo/cep_test.go`

**Interfaces:**
- Produces: `type Local struct { Lat, Lon float64; Endereco, Bairro string }`, `type CEP struct { BaseURL string }`, `NovoCEP() *CEP` (BrasilAPI), `(c *CEP) Buscar(ctx, cep string) (*Local, error)`. Devolve `nil, nil` quando não há coordenadas — o frontend então pede clique no mapa.

- [x] **Step 1: Teste**

```go
// back/geo/cep_test.go
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
	if err != nil || l == nil { t.Fatalf("esperado local, veio %v %v", l, err) }
	if l.Lat != -22.952 || l.Lon != -43.187 { t.Fatalf("coordenadas erradas: %+v", l) }
	if l.Bairro != "Botafogo" { t.Fatalf("bairro = %q", l.Bairro) }
}

func TestCEPSemCoordenadas(t *testing.T) {
	c := servidor(t, 200, `{"street":"Rua X","neighborhood":"Senador Camará","location":{"coordinates":{}}}`)
	l, err := c.Buscar(context.Background(), "21832000")
	if err != nil || l != nil { t.Fatalf("sem coordenadas deve devolver nil,nil — veio %v %v", l, err) }
}

func TestCEPInvalidoNaoChamaRede(t *testing.T) {
	c := &CEP{BaseURL: "http://127.0.0.1:1", http: http.DefaultClient}
	if l, err := c.Buscar(context.Background(), "123"); l != nil || err != nil {
		t.Fatal("CEP com menos de 8 dígitos deve sair antes da rede")
	}
}

func TestCEPNaoEncontrado(t *testing.T) {
	c := servidor(t, 404, `{}`)
	if l, _ := c.Buscar(context.Background(), "00000000"); l != nil { t.Fatal("404 deve devolver nil") }
}
```

- [x] **Step 2: Rodar — falha**

- [x] **Step 3: Implementar**

```go
package geo

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Local struct {
	Lat, Lon float64
	Endereco string
	Bairro   string
}

type CEP struct {
	BaseURL string
	http    *http.Client
}

func NovoCEP() *CEP {
	return &CEP{BaseURL: "https://brasilapi.com.br", http: &http.Client{Timeout: 8 * time.Second}}
}

func soDigitos(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' { b.WriteRune(r) }
	}
	return b.String()
}

// Buscar devolve (nil, nil) quando o CEP existe mas a BrasilAPI não tem coordenadas.
func (c *CEP) Buscar(ctx context.Context, cep string) (*Local, error) {
	d := soDigitos(cep)
	if len(d) != 8 { return nil, nil }
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/api/cep/v2/"+d, nil)
	if err != nil { return nil, err }
	resp, err := c.http.Do(req)
	if err != nil { return nil, nil } // rede instável não derruba o fluxo: cai no clique no mapa
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK { return nil, nil }

	var body struct {
		Street, Neighborhood, City string
		Location                   struct {
			Coordinates struct{ Latitude, Longitude string } `json:"coordinates"`
		} `json:"location"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil { return nil, nil }
	lat, e1 := strconv.ParseFloat(body.Location.Coordinates.Latitude, 64)
	lon, e2 := strconv.ParseFloat(body.Location.Coordinates.Longitude, 64)
	if e1 != nil || e2 != nil { return nil, nil }

	partes := []string{}
	for _, p := range []string{body.Street, body.Neighborhood, body.City} {
		if p != "" { partes = append(partes, p) }
	}
	return &Local{Lat: lat, Lon: lon, Endereco: strings.Join(partes, ", "), Bairro: body.Neighborhood}, nil
}
```

- [x] **Step 4: `go test ./back/geo/ -v` → PASS**
- [x] **Step 5: Commit** — `git add back/geo && git commit -m "feat: geocodificação de CEP com fallback silencioso"`

---

### Task 7: Recomendação — `back/recomenda/recomenda.go`

**Files:**
- Create: `back/recomenda/recomenda.go`, `back/recomenda/recomenda_test.go`

**Interfaces:**
- Consumes: `modelo.Ref`.
- Produces:
  - `type Candidata struct { Cod, Nome, Bairro string; Lat, Lon, Km float64; TaxaRef *float64; NRef int }`
  - `type Sugestao struct { Candidata; P float64 `json:"p"`; PPct int `json:"p_pct"`; Fator float64 `json:"fator"`; Motivo string `json:"motivo"` }`
  - `Fator(taxaRef *float64, nRef int, mediana float64) float64`
  - `Probabilidade(ref *modelo.Ref, taxaRef *float64, nRef int, km float64, posicao int) float64`
  - `Ranquear(ref *modelo.Ref, cands []Candidata, top int) []Sugestao` — ordena por `P` desc, empate por `Km` asc.
  - `Buscar(ctx, pool, lat, lon float64, grupamento, horario string, raioKm float64) ([]Candidata, error)` — `ST_DWithin` no PostGIS.

- [x] **Step 1: Teste (só a lógica pura; `Buscar` é validado no smoke da Task 9)**

```go
// back/recomenda/recomenda_test.go
package recomenda

import (
	"testing"

	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
)

func ref() *modelo.Ref {
	r := &modelo.Ref{Mediana: 0.34}
	r.PBase = [5][3]float64{
		{0.403, 0.378, 0.337}, {0.175, 0.154, 0.133},
		{0.124, 0.105, 0.083}, {0.096, 0.075, 0.063}, {0.087, 0.067, 0.055},
	}
	return r
}
func f(v float64) *float64 { return &v }

func TestFatorLimitado(t *testing.T) {
	r := ref()
	if got := Fator(f(0.90), 100, r.Mediana); got != 1.6 { t.Fatalf("teto = %f", got) }
	if got := Fator(f(0.05), 100, r.Mediana); got != 0.5 { t.Fatalf("piso = %f", got) }
	if got := Fator(nil, 0, r.Mediana); got != 1.0 { t.Fatalf("sem taxa = %f", got) }
	if got := Fator(f(0.90), 5, r.Mediana); got != 1.0 { t.Fatalf("amostra pequena = %f", got) }
}

func TestProbabilidadeUsaFaixaEPosicao(t *testing.T) {
	r := ref()
	perto := Probabilidade(r, f(0.34), 100, 1.0, 1)
	longe := Probabilidade(r, f(0.34), 100, 7.0, 1)
	if !(perto > longe) { t.Fatalf("perto %f deveria superar longe %f", perto, longe) }
	if quinta := Probabilidade(r, f(0.34), 100, 1.0, 5); quinta >= perto {
		t.Fatalf("5ª opção %f deveria ser menor que 1ª %f", quinta, perto)
	}
	if p := Probabilidade(r, f(0.99), 500, 0.5, 1); p > 0.95 { t.Fatalf("teto 0.95 furado: %f", p) }
	if p := Probabilidade(r, f(0.001), 500, 20, 5); p < 0.02 { t.Fatalf("piso 0.02 furado: %f", p) }
}

func TestRanquearOrdenaPorProbabilidade(t *testing.T) {
	cands := []Candidata{
		{Cod: "longe", Km: 8, TaxaRef: f(0.34), NRef: 100},
		{Cod: "perto", Km: 0.5, TaxaRef: f(0.34), NRef: 100},
		{Cod: "perto-fraca", Km: 0.6, TaxaRef: f(0.10), NRef: 100},
	}
	out := Ranquear(ref(), cands, 5)
	if out[0].Cod != "perto" { t.Fatalf("primeiro = %s", out[0].Cod) }
	if len(out) != 3 { t.Fatalf("len = %d", len(out)) }
	if out[0].PPct < 1 || out[0].Motivo == "" { t.Fatalf("campos de apresentação vazios: %+v", out[0]) }
	for i := 1; i < len(out); i++ {
		if out[i-1].P < out[i].P { t.Fatal("ordem decrescente quebrada") }
	}
}

func TestRanquearRespeitaTop(t *testing.T) {
	cands := make([]Candidata, 12)
	for i := range cands { cands[i] = Candidata{Cod: string(rune('a' + i)), Km: float64(i), TaxaRef: f(0.34), NRef: 100} }
	if got := len(Ranquear(ref(), cands, 5)); got != 5 { t.Fatalf("top 5 → %d", got) }
}
```

- [x] **Step 2: Rodar — falha**

- [x] **Step 3: Implementar**

```go
package recomenda

import (
	"context"
	"math"
	"sort"

	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Candidata struct {
	Cod, Nome, Bairro string
	Lat, Lon, Km      float64
	TaxaRef           *float64
	NRef              int
}

type Sugestao struct {
	Cod    string  `json:"cod"`
	Nome   string  `json:"nome"`
	Bairro string  `json:"bairro"`
	Lat    float64 `json:"lat"`
	Lon    float64 `json:"lon"`
	Km     float64 `json:"km"`
	P      float64 `json:"p"`
	PPct   int     `json:"p_pct"`
	Fator  float64 `json:"fator"`
	Motivo string  `json:"motivo"`
}

const amostraMinima = 20

// Fator ajusta a probabilidade pelo histórico da unidade, limitado a [0,5; 1,6].
func Fator(taxaRef *float64, nRef int, mediana float64) float64 {
	if taxaRef == nil || nRef < amostraMinima || mediana <= 0 { return 1.0 }
	return math.Max(0.5, math.Min(1.6, *taxaRef/mediana))
}

func Probabilidade(ref *modelo.Ref, taxaRef *float64, nRef int, km float64, posicao int) float64 {
	if posicao < 1 { posicao = 1 }
	if posicao > 5 { posicao = 5 }
	f := 0
	switch {
	case km < 2:
		f = 0
	case km < 5:
		f = 1
	default:
		f = 2
	}
	p := ref.PBase[posicao-1][f] * Fator(taxaRef, nRef, ref.Mediana)
	return math.Round(math.Max(0.02, math.Min(0.95, p))*10000) / 10000
}

func motivo(km float64, fator float64) string {
	switch {
	case km < 2 && fator >= 1:
		return "muito perto e com boa taxa de entrada"
	case km < 2:
		return "muito perto da sua referência"
	case fator >= 1.2:
		return "boa taxa de entrada no ano passado"
	default:
		return "dentro do raio que você escolheu"
	}
}

// Ranquear apresenta as candidatas como se cada uma fosse a 1ª opção.
func Ranquear(ref *modelo.Ref, cands []Candidata, top int) []Sugestao {
	out := make([]Sugestao, 0, len(cands))
	for _, c := range cands {
		f := Fator(c.TaxaRef, c.NRef, ref.Mediana)
		p := Probabilidade(ref, c.TaxaRef, c.NRef, c.Km, 1)
		out = append(out, Sugestao{
			Cod: c.Cod, Nome: c.Nome, Bairro: c.Bairro, Lat: c.Lat, Lon: c.Lon,
			Km: math.Round(c.Km*100) / 100, P: p, PPct: int(math.Round(p * 100)),
			Fator: math.Round(f*100) / 100, Motivo: motivo(c.Km, f),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].P != out[j].P { return out[i].P > out[j].P }
		return out[i].Km < out[j].Km
	})
	if len(out) > top { out = out[:top] }
	return out
}

// Buscar usa o índice GiST: só as unidades dentro do raio que oferecem grupamento+horário.
func Buscar(ctx context.Context, pool *pgxpool.Pool, lat, lon float64,
	grupamento, horario string, raioKm float64) ([]Candidata, error) {
	const q = `
		SELECT u.cod, u.nome, coalesce(u.bairro,''),
		       ST_Y(u.geom::geometry), ST_X(u.geom::geometry),
		       ST_Distance(u.geom, $1::geography) / 1000.0 AS km,
		       u.taxa_ref, u.n_ref
		FROM unidades u
		WHERE EXISTS (SELECT 1 FROM unidade_oferta o
		              WHERE o.cod = u.cod AND o.grupamento = $2 AND o.horario = $3)
		  AND ST_DWithin(u.geom, $1::geography, $4)
		ORDER BY km`
	ponto := "SRID=4326;POINT(" + ftoa(lon) + " " + ftoa(lat) + ")"
	rows, err := pool.Query(ctx, q, ponto, grupamento, horario, raioKm*1000)
	if err != nil { return nil, err }
	defer rows.Close()
	var out []Candidata
	for rows.Next() {
		var c Candidata
		if err := rows.Scan(&c.Cod, &c.Nome, &c.Bairro, &c.Lat, &c.Lon, &c.Km, &c.TaxaRef, &c.NRef); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func ftoa(v float64) string { return strconvFormat(v) }
```

Adicionar no topo o import `"strconv"` e a função:
```go
func strconvFormat(v float64) string { return strconv.FormatFloat(v, 'f', 8, 64) }
```

- [x] **Step 4: `go test ./back/recomenda/ -v` → PASS**
- [x] **Step 5: Commit** — `git add back/recomenda && git commit -m "feat: probabilidade auditável e busca geográfica com PostGIS"`

---

### Task 8: API — `back/api/` + `back`

**Files:**
- Create: `back/api/router.go`, `back/api/auth.go`, `back/api/inscricao.go`, `back/api/auth_test.go`, `back/main.go`

**Interfaces:**
- `type App struct { Pool *pgxpool.Pool; Ref *modelo.Ref; Verificacao *verificacao.Cliente; CEP *geo.CEP; AnoLetivo int }`, `(a *App) Rotas() http.Handler`.
- Rotas (todas sob `/api`, JSON; as de inscrição exigem `Authorization: Bearer`):
  - `POST /api/auth/registrar {cpf,nome,nascimento,senha}` → `{token,nome}`
  - `POST /api/auth/entrar {cpf,senha}` → `{token,nome}`
  - `GET  /api/eu` → `{cpf,nome}`
  - `GET  /api/inscricao/preparar` → `{perguntas:[{...,validada,valor,fonte}],contato,grupamentos,horarios}`
  - `POST /api/inscricao/respostas {respostas:{"28":true},nascimento_crianca,horario}` → `{score,grupamento}`
  - `POST /api/inscricao/referencia {cep?|lat,lon,texto?}` → `{lat,lon,texto}`
  - `GET  /api/inscricao/recomendacoes?raio_km=5` → `{referencia,grupamento,horario,recomendadas,todas}`
  - `POST /api/inscricao/opcoes {unidades:[...]}` → `{ok,opcoes}`
  - `GET  /api/inscricao` → estado atual

- [x] **Step 1: Teste de autenticação (usa o banco real do Supabase; limpa o que cria)**

```go
// back/api/auth_test.go
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
	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
	"github.com/antoniomesquita09/impact-lab-34/back/verificacao"
	"github.com/antoniomesquita09/impact-lab-34/back/geo"
)

const cpfTeste = "00000000191"

func appDeTeste(t *testing.T) (*App, func()) {
	if os.Getenv("DATABASE_URL") == "" { t.Skip("DATABASE_URL não definida") }
	ctx := context.Background()
	pool, err := db.Abrir(ctx)
	if err != nil { t.Fatal(err) }
	ref, err := modelo.Carregar(ctx, pool)
	if err != nil { t.Fatalf("rode ./pipeline antes: %v", err) }
	pool.Exec(ctx, `DELETE FROM contas WHERE cpf=$1`, cpfTeste)
	return &App{Pool: pool, Ref: ref, Verificacao: verificacao.NovoCliente("", "", "../../back/mocks/criterios.json"), CEP: geo.NovoCEP(), AnoLetivo: 2026},
		func() { pool.Exec(ctx, `DELETE FROM contas WHERE cpf=$1`, cpfTeste); pool.Close() }
}

func post(t *testing.T, h http.Handler, path, tok string, body any) (*httptest.ResponseRecorder, map[string]any) {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", path, bytes.NewReader(b))
	if tok != "" { req.Header.Set("Authorization", "Bearer "+tok) }
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	return w, out
}

func TestRegistrarEntrarEu(t *testing.T) {
	app, limpar := appDeTeste(t)
	defer limpar()
	h := app.Rotas()

	w, out := post(t, h, "/api/auth/registrar", "", map[string]string{
		"cpf": "000.000.001-91", "nome": "Teste", "nascimento": "1990-01-01", "senha": "segredo"})
	if w.Code != 200 { t.Fatalf("registrar = %d: %s", w.Code, w.Body) }
	if out["token"] == nil { t.Fatal("sem token") }

	w2, out2 := post(t, h, "/api/auth/entrar", "", map[string]string{"cpf": cpfTeste, "senha": "segredo"})
	if w2.Code != 200 { t.Fatalf("entrar = %d", w2.Code) }
	tok := out2["token"].(string)

	req := httptest.NewRequest("GET", "/api/eu", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	w3 := httptest.NewRecorder()
	h.ServeHTTP(w3, req)
	if w3.Code != 200 { t.Fatalf("eu = %d", w3.Code) }
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
	if w.Code != 401 { t.Fatalf("sem token = %d", w.Code) }
}
```

- [x] **Step 2: Rodar — falha**

- [x] **Step 3: `back/api/router.go`**

```go
package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/antoniomesquita09/impact-lab-34/back/geo"
	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
	"github.com/antoniomesquita09/impact-lab-34/back/verificacao"
	"github.com/jackc/pgx/v5/pgxpool"
)

type App struct {
	Pool      *pgxpool.Pool
	Ref       *modelo.Ref
	Verificacao *verificacao.Cliente
	CEP         *geo.CEP
	AnoLetivo int
}

func escreverJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func erro(w http.ResponseWriter, status int, msg string) {
	escreverJSON(w, status, map[string]string{"erro": msg})
}

func lerJSON(r *http.Request, v any) error { return json.NewDecoder(r.Body).Decode(v) }

func (a *App) Rotas() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) }) // Render healthCheckPath
	mux.HandleFunc("POST /api/auth/registrar", a.registrar)
	mux.HandleFunc("POST /api/auth/entrar", a.entrar)
	mux.HandleFunc("GET /api/eu", a.autenticado(a.eu))
	mux.HandleFunc("GET /api/inscricao/preparar", a.autenticado(a.preparar))
	mux.HandleFunc("POST /api/inscricao/respostas", a.autenticado(a.respostas))
	mux.HandleFunc("POST /api/inscricao/referencia", a.autenticado(a.referencia))
	mux.HandleFunc("GET /api/inscricao/recomendacoes", a.autenticado(a.recomendacoes))
	mux.HandleFunc("POST /api/inscricao/opcoes", a.autenticado(a.opcoes))
	mux.HandleFunc("GET /api/inscricao", a.autenticado(a.estado))

	dist := "front/dist"
	if _, err := os.Stat(dist); err == nil {
		fs := http.FileServer(http.Dir(dist))
		mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			caminho := filepath.Join(dist, filepath.Clean(r.URL.Path))
			if _, err := os.Stat(caminho); err != nil { // SPA: rota do React
				http.ServeFile(w, r, filepath.Join(dist, "index.html"))
				return
			}
			fs.ServeHTTP(w, r)
		}))
	}
	return mux
}
```

- [x] **Step 4: `back/api/auth.go`**

```go
package api

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type ctxChave string

const chaveCPF ctxChave = "cpf"

func soDigitos(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' { b.WriteRune(r) }
	}
	return b.String()
}

func novoToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func (a *App) registrar(w http.ResponseWriter, r *http.Request) {
	var in struct{ CPF, Nome, Nascimento, Senha string }
	if err := lerJSON(r, &in); err != nil { erro(w, 400, "Não entendi os dados enviados."); return }
	cpf := soDigitos(in.CPF)
	if len(cpf) != 11 { erro(w, 400, "O CPF precisa ter 11 dígitos."); return }
	if in.Nome == "" || in.Senha == "" { erro(w, 400, "Preencha nome e senha."); return }

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Senha), bcrypt.DefaultCost)
	if err != nil { erro(w, 500, "Não conseguimos criar a conta. Tente de novo."); return }

	var nasc any
	if t, err := time.Parse("2006-01-02", in.Nascimento); err == nil { nasc = t }
	_, err = a.Pool.Exec(r.Context(),
		`INSERT INTO contas (cpf,nome,nascimento,senha_hash) VALUES ($1,$2,$3,$4)`,
		cpf, in.Nome, nasc, string(hash))
	if err != nil {
		erro(w, 409, "Já existe conta para este CPF. Entre com a sua senha.")
		return
	}
	tok := novoToken()
	a.Pool.Exec(r.Context(), `INSERT INTO sessoes (token,cpf) VALUES ($1,$2)`, tok, cpf)
	escreverJSON(w, 200, map[string]string{"token": tok, "nome": in.Nome})
}

func (a *App) entrar(w http.ResponseWriter, r *http.Request) {
	var in struct{ CPF, Senha string }
	if err := lerJSON(r, &in); err != nil { erro(w, 400, "Não entendi os dados enviados."); return }
	cpf := soDigitos(in.CPF)
	var nome, hash string
	err := a.Pool.QueryRow(r.Context(), `SELECT nome,senha_hash FROM contas WHERE cpf=$1`, cpf).Scan(&nome, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Senha)) != nil {
		erro(w, 401, "CPF ou senha incorretos.")
		return
	}
	tok := novoToken()
	a.Pool.Exec(r.Context(), `INSERT INTO sessoes (token,cpf) VALUES ($1,$2)`, tok, cpf)
	escreverJSON(w, 200, map[string]string{"token": tok, "nome": nome})
}

func (a *App) autenticado(h func(http.ResponseWriter, *http.Request, string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if tok == "" { erro(w, 401, "Entre com seu CPF para continuar."); return }
		var cpf string
		if err := a.Pool.QueryRow(r.Context(), `SELECT cpf FROM sessoes WHERE token=$1`, tok).Scan(&cpf); err != nil {
			erro(w, 401, "Sua sessão expirou. Entre de novo.")
			return
		}
		h(w, r, cpf)
	}
}

func (a *App) eu(w http.ResponseWriter, r *http.Request, cpf string) {
	var nome string
	a.Pool.QueryRow(r.Context(), `SELECT nome FROM contas WHERE cpf=$1`, cpf).Scan(&nome)
	escreverJSON(w, 200, map[string]string{"cpf": cpf, "nome": nome})
}
```

- [x] **Step 5: `back/api/inscricao.go`**

```go
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
	if err != nil { erro(w, 502, "Não conseguimos consultar os cadastros agora. Tente de novo."); return }
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
		"perguntas":   saida,
		"contato":     res.Pessoa,
		"grupamentos": []string{"Berçário", "Maternal I", "Maternal II"},
		"horarios":    []string{"Integral", "Parcial"},
	})
}

func (a *App) respostas(w http.ResponseWriter, r *http.Request, cpf string) {
	var in struct {
		Respostas        map[string]bool `json:"respostas"`
		NascimentoCrianca string         `json:"nascimento_crianca"`
		Horario           string         `json:"horario"`
	}
	if err := lerJSON(r, &in); err != nil { erro(w, 400, "Não entendi as respostas enviadas."); return }
	nasc, err := time.Parse("2006-01-02", in.NascimentoCrianca)
	if err != nil { erro(w, 400, "Informe a data de nascimento da criança."); return }
	if in.Horario != "Integral" && in.Horario != "Parcial" { erro(w, 400, "Escolha o turno."); return }

	final := map[int]bool{}
	for k, v := range in.Respostas {
		if id, err := strconv.Atoi(k); err == nil { final[id] = v }
	}
	// o que a Prefeitura verificou prevalece sobre o que a família marcou
	var pvJSON string
	a.Pool.QueryRow(r.Context(), `SELECT prevalidadas::text FROM inscricoes WHERE cpf=$1`, cpf).Scan(&pvJSON)
	var pv map[string]verificacao.Criterio
	json.Unmarshal([]byte(pvJSON), &pv)
	for k, v := range pv {
		if id, err := strconv.Atoi(k); err == nil { final[id] = v.Valor }
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
	if err := lerJSON(r, &in); err != nil { erro(w, 400, "Não entendi o local enviado."); return }

	var lat, lon float64
	texto := in.Texto
	switch {
	case in.Lat != nil && in.Lon != nil:
		lat, lon = *in.Lat, *in.Lon
		if texto == "" { texto = "Ponto marcado no mapa" }
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
	ponto := "SRID=4326;POINT(" + strconv.FormatFloat(lon, 'f', 8, 64) + " " + strconv.FormatFloat(lat, 'f', 8, 64) + ")"
	a.garantirInscricao(r, cpf)
	if _, err := a.Pool.Exec(r.Context(),
		`UPDATE inscricoes SET ref=$2::geography, ref_texto=$3, atualizado_em=now() WHERE cpf=$1`,
		cpf, ponto, texto); err != nil {
		erro(w, 500, "Não conseguimos salvar o local. Tente de novo.")
		return
	}
	escreverJSON(w, 200, map[string]any{"lat": lat, "lon": lon, "texto": texto})
}

func (a *App) recomendacoes(w http.ResponseWriter, r *http.Request, cpf string) {
	raio := 5.0
	if v := r.URL.Query().Get("raio_km"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 && f <= 30 { raio = f }
	}
	var lat, lon *float64
	var texto, grupamento, horario *string
	err := a.Pool.QueryRow(r.Context(),
		`SELECT ST_Y(ref::geometry), ST_X(ref::geometry), ref_texto, grupamento, horario FROM inscricoes WHERE cpf=$1`,
		cpf).Scan(&lat, &lon, &texto, &grupamento, &horario)
	if err != nil || lat == nil { erro(w, 400, "Informe o local de referência primeiro."); return }
	if grupamento == nil || horario == nil { erro(w, 400, "Preencha os dados da criança primeiro."); return }

	cands, err := recomenda.Buscar(r.Context(), a.Pool, *lat, *lon, *grupamento, *horario, raio)
	if err != nil { erro(w, 500, "Não conseguimos buscar as creches agora."); return }
	if len(cands) == 0 { // amplia o raio uma vez antes de desistir
		cands, _ = recomenda.Buscar(r.Context(), a.Pool, *lat, *lon, *grupamento, *horario, raio*2)
	}
	sug := recomenda.Ranquear(a.Ref, cands, 5)

	type ponto struct {
		Cod    string  `json:"cod"`
		Nome   string  `json:"nome"`
		Lat    float64 `json:"lat"`
		Lon    float64 `json:"lon"`
		Bairro string  `json:"bairro"`
	}
	rows, _ := a.Pool.Query(r.Context(),
		`SELECT cod,nome,ST_Y(geom::geometry),ST_X(geom::geometry),coalesce(bairro,'') FROM unidades`)
	todas := []ponto{}
	for rows.Next() {
		var p ponto
		if rows.Scan(&p.Cod, &p.Nome, &p.Lat, &p.Lon, &p.Bairro) == nil { todas = append(todas, p) }
	}
	rows.Close()

	escreverJSON(w, 200, map[string]any{
		"referencia":  map[string]any{"lat": *lat, "lon": *lon, "texto": texto},
		"grupamento":  *grupamento,
		"horario":     *horario,
		"recomendadas": sug,
		"todas":        todas,
	})
}

func (a *App) opcoes(w http.ResponseWriter, r *http.Request, cpf string) {
	var in struct {
		Unidades []string `json:"unidades"`
	}
	if err := lerJSON(r, &in); err != nil { erro(w, 400, "Não entendi as opções enviadas."); return }
	if len(in.Unidades) < 1 || len(in.Unidades) > 5 { erro(w, 400, "Escolha de 1 a 5 creches."); return }
	var validas int
	a.Pool.QueryRow(r.Context(), `SELECT count(*) FROM unidades WHERE cod = ANY($1)`, in.Unidades).Scan(&validas)
	if validas != len(in.Unidades) { erro(w, 400, "Uma das creches escolhidas não existe mais."); return }

	b, _ := json.Marshal(in.Unidades)
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
	var lista []string
	json.Unmarshal([]byte(opcoes), &lista)
	escreverJSON(w, 200, map[string]any{
		"score": score, "grupamento": grup, "horario": hor, "ref_texto": texto, "opcoes": lista,
	})
}
```

- [x] **Step 6: `back/main.go`**

```go
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
	if err != nil { log.Fatal(err) }
	defer pool.Close()

	ref, err := modelo.Carregar(ctx, pool)
	if err != nil { log.Fatalf("dados de referência ausentes — rode `go run ./pipeline`: %v", err) }
	log.Printf("régua com %d perguntas · mediana %.3f", len(ref.Perguntas), ref.Mediana)

	app := &api.App{
		Pool: pool, Ref: ref,
		Verificacao: verificacao.NovoDoAmbiente("back/mocks/criterios.json"),
		CEP:         geo.NovoCEP(),
		AnoLetivo: 2026,
	}
	porta := os.Getenv("PORT")
	if porta == "" { porta = "8080" }
	log.Printf("ouvindo em :%s", porta)
	log.Fatal(http.ListenAndServe(":"+porta, app.Rotas()))
}
```

- [ ] **Step 7: `go test ./... -v` → PASS** e subir o servidor: `go run ./back`
- [ ] **Step 8: Smoke da API**

```bash
TOK=$(curl -s localhost:8080/api/auth/registrar -d '{"cpf":"10000000019","nome":"Ana","nascimento":"1996-04-12","senha":"x"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s localhost:8080/api/inscricao/preparar -H "Authorization: Bearer $TOK" | head -c 400
curl -s localhost:8080/api/inscricao/respostas -H "Authorization: Bearer $TOK" -d '{"respostas":{"31":false},"nascimento_crianca":"2025-06-10","horario":"Integral"}'
curl -s localhost:8080/api/inscricao/referencia -H "Authorization: Bearer $TOK" -d '{"lat":-22.883,"lon":-43.501,"texto":"Casa"}'
curl -s "localhost:8080/api/inscricao/recomendacoes?raio_km=5" -H "Authorization: Bearer $TOK" | python3 -m json.tool | head -40
```
Esperado: `preparar` traz CadÚnico validado; `respostas` devolve `score` ≥ 53 e `Berçário`; `recomendacoes` traz até 5 creches com `km` e `p_pct`.

- [x] **Step 9: Commit** — `git add back/api back && git commit -m "feat: API da inscrição e servidor"`

---

### Task 9: Frontend (`front/`) — Vite + React + react-map-gl

**Files:**
- Create: `front/package.json`, `front/vite.config.js`, `front/index.html`, `front/src/{main.jsx,api.js,App.jsx,styles.css}`, `front/src/pages/{Entrar,Dados,Referencia,Creches,Concluida}.jsx`

Sem testes unitários (tempo). Verificação: `npm run build` limpo + fluxo manual com os 3 CPFs.

- [ ] **Step 1: Scaffold e dependências**

```bash
cd front && npm create vite@latest . -- --template react   # aceitar sobrescrever
npm i maplibre-gl react-map-gl react-router-dom
```

`vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], server: { proxy: { '/api': 'http://localhost:8080' } } })
```

`index.html`: trocar o `<title>` por `Matrícula Carioca`.

- [ ] **Step 2: `src/api.js`, `src/App.jsx`, `src/main.jsx`**

```js
// src/api.js
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const token = () => localStorage.getItem('token') || ''

export async function api(path, body, method) {
  const r = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || 'Algo deu errado. Tente de novo.')
  return j
}
```

```jsx
// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Entrar from './pages/Entrar'
import Dados from './pages/Dados'
import Referencia from './pages/Referencia'
import Creches from './pages/Creches'
import Concluida from './pages/Concluida'

const Privada = ({ children }) => (localStorage.getItem('token') ? children : <Navigate to="/entrar" replace />)

export default function App() {
  return (
    <BrowserRouter>
      <header className="topo">
        <b>Matrícula Carioca</b>
        <span>Creches da rede municipal · 2026</span>
      </header>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/inscricao/dados" element={<Privada><Dados /></Privada>} />
        <Route path="/inscricao/referencia" element={<Privada><Referencia /></Privada>} />
        <Route path="/inscricao/creches" element={<Privada><Creches /></Privada>} />
        <Route path="/inscricao/concluida" element={<Privada><Concluida /></Privada>} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

`src/main.jsx`: o padrão do Vite, trocando o import do CSS por `import './styles.css'` e renderizando `<App />`.

- [ ] **Step 3: `src/pages/Entrar.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Entrar() {
  const navegar = useNavigate()
  const [modo, setModo] = useState('entrar')
  const [f, setF] = useState({ cpf: '', nome: '', nascimento: '', senha: '' })
  const [erro, setErro] = useState('')
  const mudar = e => setF({ ...f, [e.target.name]: e.target.value })

  async function enviar(e) {
    e.preventDefault(); setErro('')
    try {
      const r = await api(`/api/auth/${modo === 'entrar' ? 'entrar' : 'registrar'}`, f)
      localStorage.setItem('token', r.token); localStorage.setItem('nome', r.nome)
      navegar('/inscricao/dados')
    } catch (x) { setErro(x.message) }
  }

  return (
    <main className="card">
      <h1>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
      <p className="lede">Com o seu CPF a Prefeitura já confirma vários critérios por você. Você responde só o que falta.</p>
      <form onSubmit={enviar}>
        <label>CPF<input name="cpf" value={f.cpf} onChange={mudar} inputMode="numeric" placeholder="000.000.000-00" required /></label>
        {modo === 'criar' && (
          <>
            <label>Nome do responsável<input name="nome" value={f.nome} onChange={mudar} required /></label>
            <label>Data de nascimento do responsável<input name="nascimento" type="date" value={f.nascimento} onChange={mudar} required /></label>
          </>
        )}
        <label>Senha<input name="senha" type="password" value={f.senha} onChange={mudar} required /></label>
        {erro && <p className="erro">{erro}</p>}
        <button>{modo === 'entrar' ? 'Entrar' : 'Criar conta e continuar'}</button>
      </form>
      <button className="link" onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>
        {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
      </button>
      <p className="demo">Demonstração: 100.000.000-19 (Ana) · 100.000.001-08 (Bruno) · 100.000.002-80 (Carla). Crie a conta com qualquer senha.</p>
    </main>
  )
}
```

- [ ] **Step 4: `src/pages/Dados.jsx` — o formulário híbrido**

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Dados() {
  const navegar = useNavigate()
  const [dados, setDados] = useState(null)
  const [resp, setResp] = useState({})
  const [nasc, setNasc] = useState('')
  const [horario, setHorario] = useState('Integral')
  const [erro, setErro] = useState('')

  useEffect(() => { api('/api/inscricao/preparar').then(setDados).catch(x => setErro(x.message)) }, [])

  if (!dados) return <main className="card"><p>Consultando os cadastros da Prefeitura…</p>{erro && <p className="erro">{erro}</p>}</main>

  const validadas = dados.perguntas.filter(q => q.validada)
  const pendentes = dados.perguntas.filter(q => !q.validada)

  async function enviar(e) {
    e.preventDefault(); setErro('')
    try {
      await api('/api/inscricao/respostas', { respostas: resp, nascimento_crianca: nasc, horario })
      navegar('/inscricao/referencia')
    } catch (x) { setErro(x.message) }
  }

  return (
    <main className="card">
      <h1>Dados da criança e da família</h1>
      <form onSubmit={enviar}>
        <label>Data de nascimento da criança<input type="date" value={nasc} onChange={e => setNasc(e.target.value)} required /></label>
        <label>Turno<select value={horario} onChange={e => setHorario(e.target.value)}>{dados.horarios.map(h => <option key={h}>{h}</option>)}</select></label>

        <h2>Já confirmado pela Prefeitura</h2>
        <p className="ajuda">Você não precisa responder estes itens. Se algo estiver errado, procure o CRAS ou a unidade.</p>
        <ul className="validadas">
          {validadas.map(q => (
            <li key={q.id}>
              <span className={q.valor ? 'sim' : 'nao'}>{q.valor ? 'Sim' : 'Não'}</span>
              <span>{q.texto}<small>{q.fonte}</small></span>
            </li>
          ))}
        </ul>

        <h2>Falta você responder</h2>
        <p className="ajuda">Estas respostas contam para a sua posição na fila. A unidade pode pedir comprovação.</p>
        {pendentes.map(q => (
          <fieldset className="pergunta" key={q.id}>
            <legend>{q.texto}</legend>
            <label><input type="radio" name={`p${q.id}`} checked={resp[q.id] === true} onChange={() => setResp({ ...resp, [q.id]: true })} /> Sim</label>
            <label><input type="radio" name={`p${q.id}`} checked={!resp[q.id]} onChange={() => setResp({ ...resp, [q.id]: false })} /> Não</label>
          </fieldset>
        ))}

        {erro && <p className="erro">{erro}</p>}
        <button>Continuar</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 5: `src/pages/Referencia.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, MAP_STYLE } from '../api'

export default function Referencia() {
  const navegar = useNavigate()
  const [cep, setCep] = useState('')
  const [ponto, setPonto] = useState(null)
  const [erro, setErro] = useState('')
  const [view, setView] = useState({ longitude: -43.35, latitude: -22.91, zoom: 10 })

  useEffect(() => {
    api('/api/inscricao/preparar').then(d => {
      const e = d.contato?.endereco
      if (e?.latitude != null) {
        setPonto({ lat: e.latitude, lon: e.longitude, texto: `${e.logradouro}, ${e.bairro} (endereço do seu cadastro)` })
        setView(v => ({ ...v, latitude: e.latitude, longitude: e.longitude, zoom: 14 }))
        if (e.cep) setCep(e.cep)
      }
    }).catch(() => {})
  }, [])

  async function buscarCep() {
    setErro('')
    try {
      const r = await api('/api/inscricao/referencia', { cep })
      setPonto({ lat: r.lat, lon: r.lon, texto: r.texto })
      setView(v => ({ ...v, latitude: r.lat, longitude: r.lon, zoom: 14 }))
    } catch (x) { setErro(x.message) }
  }

  async function continuar() {
    setErro('')
    try {
      await api('/api/inscricao/referencia', { lat: ponto.lat, lon: ponto.lon, texto: ponto.texto })
      navegar('/inscricao/creches')
    } catch (x) { setErro(x.message) }
  }

  return (
    <main className="card largo">
      <h1>De onde você vai levar a criança?</h1>
      <p className="lede">Pode ser sua casa, o trabalho ou a casa de quem cuida. A distância é o que mais pesa na chance de a matrícula dar certo.</p>
      <div className="linha">
        <input value={cep} onChange={e => setCep(e.target.value)} placeholder="CEP" inputMode="numeric" />
        <button type="button" onClick={buscarCep}>Buscar CEP</button>
      </div>
      <p className="ajuda">Ou toque no mapa para marcar o ponto.</p>
      <div className="mapa">
        <Map {...view} onMove={e => setView(e.viewState)} mapStyle={MAP_STYLE} style={{ width: '100%', height: '100%' }}
             onClick={e => setPonto({ lat: e.lngLat.lat, lon: e.lngLat.lng, texto: 'Ponto marcado no mapa' })}>
          <NavigationControl position="top-right" />
          {ponto && <Marker longitude={ponto.lon} latitude={ponto.lat} color="#A2382F" />}
        </Map>
      </div>
      {ponto && <p className="ok">Referência: {ponto.texto}</p>}
      {erro && <p className="erro">{erro}</p>}
      <button disabled={!ponto} onClick={continuar}>Ver creches perto daqui</button>
    </main>
  )
}
```

- [ ] **Step 6: `src/pages/Creches.jsx` — mapa e recomendação**

As 872 creches vão como uma `Source` GeoJSON + `Layer` circle (uma passada de WebGL). Só as 5 recomendadas e a referência viram `Marker`.

```jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker, Source, Layer, NavigationControl, Popup } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, MAP_STYLE } from '../api'

const camadaTodas = {
  id: 'todas', type: 'circle',
  paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 5],
           'circle-color': '#7C8CA1', 'circle-opacity': 0.65,
           'circle-stroke-width': 1, 'circle-stroke-color': '#E9EDF2' },
}

export default function Creches() {
  const navegar = useNavigate()
  const [dados, setDados] = useState(null)
  const [sel, setSel] = useState([])
  const [popup, setPopup] = useState(null)
  const [erro, setErro] = useState('')
  const [view, setView] = useState(null)

  useEffect(() => {
    api('/api/inscricao/recomendacoes?raio_km=5').then(d => {
      setDados(d)
      setView({ longitude: d.referencia.lon, latitude: d.referencia.lat, zoom: 13.5 })
    }).catch(x => setErro(x.message))
  }, [])

  const geojson = useMemo(() => {
    if (!dados) return null
    const recomendadas = new Set(dados.recomendadas.map(r => r.cod))
    return {
      type: 'FeatureCollection',
      features: dados.todas.filter(u => !recomendadas.has(u.cod)).map(u => ({
        type: 'Feature', properties: { nome: u.nome, bairro: u.bairro },
        geometry: { type: 'Point', coordinates: [u.lon, u.lat] },
      })),
    }
  }, [dados])

  if (!dados || !view) return <main className="card"><p>Calculando as melhores opções…</p>{erro && <p className="erro">{erro}</p>}</main>

  const alternar = cod => setSel(sel.includes(cod) ? sel.filter(c => c !== cod) : sel.length < 5 ? [...sel, cod] : sel)

  async function concluir() {
    try { await api('/api/inscricao/opcoes', { unidades: sel }); navegar('/inscricao/concluida') }
    catch (x) { setErro(x.message) }
  }

  return (
    <main className="card largo">
      <h1>Creches para {dados.grupamento} · {dados.horario}</h1>
      <p className="lede">Ordenadas pela chance de a matrícula dar certo, combinando a distância da sua referência com o histórico de cada unidade. Escolha até 5, na ordem de preferência.</p>
      <div className="duas">
        <div className="mapa alto">
          <Map {...view} onMove={e => setView(e.viewState)} mapStyle={MAP_STYLE}
               style={{ width: '100%', height: '100%' }} interactiveLayerIds={['todas']}
               onClick={e => { const f = e.features?.[0]
                 setPopup(f ? { lon: e.lngLat.lng, lat: e.lngLat.lat, nome: f.properties.nome, bairro: f.properties.bairro } : null) }}>
            <NavigationControl position="top-right" />
            <Source id="todas-src" type="geojson" data={geojson}><Layer {...camadaTodas} /></Source>
            <Marker longitude={dados.referencia.lon} latitude={dados.referencia.lat} color="#10203A" />
            {dados.recomendadas.map((r, i) => (
              <Marker key={r.cod} longitude={r.lon} latitude={r.lat} color={sel.includes(r.cod) ? '#12626A' : '#A2382F'}
                      onClick={ev => { ev.originalEvent.stopPropagation(); alternar(r.cod) }}>
                <div className="pin">{i + 1}</div>
              </Marker>
            ))}
            {popup && <Popup longitude={popup.lon} latitude={popup.lat} onClose={() => setPopup(null)} closeButton={false}>
              <b>{popup.nome}</b><br />{popup.bairro}</Popup>}
          </Map>
        </div>
        <ol className="lista">
          {dados.recomendadas.map((r, i) => (
            <li key={r.cod} className={sel.includes(r.cod) ? 'sel' : ''} onClick={() => alternar(r.cod)}>
              <span className="ordem">{i + 1}</span>
              <div className="quem"><b>{r.nome}</b><small>{r.bairro} · {r.km} km</small></div>
              <div className="chance"><b>{r.p_pct}%</b><small>chance de entrar</small></div>
              <small className="motivo">{r.motivo}{sel.includes(r.cod) && ` · sua ${sel.indexOf(r.cod) + 1}ª opção`}</small>
            </li>
          ))}
        </ol>
      </div>
      <p className="ajuda">A chance é uma estimativa a partir dos processos de 2021 a 2025 e não garante vaga. A ordem de chamada segue os critérios da SME.</p>
      {erro && <p className="erro">{erro}</p>}
      <button disabled={!sel.length} onClick={concluir}>Confirmar {sel.length ? `${sel.length} opção(ões)` : ''}</button>
    </main>
  )
}
```

- [ ] **Step 7: `src/pages/Concluida.jsx` e `src/styles.css`**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api'
export default function Concluida() {
  const [e, setE] = useState(null)
  useEffect(() => { api('/api/inscricao').then(setE).catch(() => {}) }, [])
  return (
    <main className="card">
      <h1>Inscrição enviada</h1>
      <p className="lede">Guardamos suas opções na ordem escolhida. Quando surgir vaga, a unidade entra em contato pelo telefone do seu cadastro.</p>
      {e?.opcoes?.length > 0 && <ol className="resumo">{e.opcoes.map(c => <li key={c}>{c}</li>)}</ol>}
      <p className="ajuda">Protótipo do Claude Impact Lab — nada foi enviado ao matricula.rio.</p>
    </main>
  )
}
```

`styles.css` — paleta coerente com a ilustração já publicada: fundo `#E9EDF2`, tinta `#10203A`, destaque `#A2382F`, verde-petróleo `#12626A`, cinza `#7C8CA1`. Classes usadas: `.topo .card .largo .lede .ajuda .erro .ok .demo .link .pergunta .validadas .sim .nao .linha .mapa .alto .duas .lista .sel .ordem .quem .chance .motivo .pin .resumo`. **O contêiner do mapa precisa de altura explícita** (`.mapa{height:340px;border-radius:8px;overflow:hidden} .alto{height:520px}`), senão o MapLibre renderiza com 0px. `.duas{display:grid;grid-template-columns:1fr 1fr;gap:20px}` colapsando para uma coluna abaixo de 860px.

- [ ] **Step 8: Rodar e percorrer o fluxo**

```bash
# terminal 1
go run ./back
# terminal 2
cd front && npm run dev
```
Percorrer com `100.000.000-19`: CadÚnico e "aguardou fila" já confirmados → responder o resto → CEP `21832-000` (se não vier coordenada, clicar no mapa) → 5 recomendadas com % → escolher 3 → tela final. Repetir com `100.000.002-80`, que **não tem endereço no cadastro** — o mapa abre no Rio inteiro até clicar.

**Se o OpenFreeMap estiver instável**, trocar `MAP_STYLE` em `api.js` por outro provedor ou cair para Leaflet. Testar isso na primeira hora, não às 16h.

- [ ] **Step 9: Build e commit** — `cd front && npm run build && cd .. && git add web && git commit -m "feat: frontend do fluxo de inscrição com MapLibre"`

---

### Task 10: Deploy, README e entrega

**Files:**
- Create: `render.yaml`, `README.md`

- [x] **Step 1: `render.yaml`** — já está na raiz do repositório (`plan: starter`, `healthCheckPath:
/api/health`, build do `front/` + `go build -o server ./back`). `.env.example` também.

**Decisão de deploy (30/08 ~12h45): tudo no Render, sem Vercel.** O binário Go serve a API e o
`front/dist`, então há uma origem só — sem CORS, sem cookie cross-domain, um único link para o README.
Alternativas avaliadas e descartadas para hoje: Fly.io (CLI + cartão), Railway (crédito de trial),
Cloud Run (projeto GCP + billing; melhor história de escala, mas 30–60 min de setup). Se alguém
insistir em Vercel para o front, o jeito é `vercel.json` com rewrite de `/api/*` para a URL do
Render — não mudar o backend por isso.

**Plano Starter (US$ 7/mês), não Free.** O Free dorme após 15 min sem tráfego e acorda em 30–50 s —
tela branca na frente da banca. Desligar o serviço depois do evento. Se por algum motivo ficar no
Free: alguém abre a URL 2 min antes do pitch e deixa uma aba fazendo `fetch('/api/health')` a cada
5 min.

Se o build de Node no runtime Go der problema, alternativa mais simples: rodar `npm run build` local,
commitar `front/dist` (tirando-o do `.gitignore`) e deixar `buildCommand: go build -o server ./back`.

- [ ] **Step 2: Publicar**

Push confirmado em `antoniomesquita09/impact-lab-34` (`push: true` para `jpnas` desde 30/08 12:27).
**Não criar outro repositório**; se alguém do time não conseguir empurrar, o dono adiciona como
colaborador.

No Render: *New → Blueprint*, apontar para o repositório (ele lê o `render.yaml`), definir
`DATABASE_URL` em *Environment*, aguardar o deploy e testar a URL com os CPFs de
`back/mocks/README.md`. Conferir `https://<app>.onrender.com/api/health` → `ok`.

- [ ] **Step 3: README**

Nesta ordem: **Nome da equipe** · **Membros** · **Resumo** (a tese "a Prefeitura já tem os dados que pede à família"; o que o protótipo faz; os números: opção no próprio bairro confirma 27,2% contra 18,1%; 25,7% de quem tinha direito ao ponto da fila não o declarou; o formulário de 13 perguntas poderia ter 5) · **Arquitetura** (pipeline anual `pipeline` → Postgres/PostGIS → API Go → SPA; como o Claude foi usado para construir: análise das bases, calibração, código; **como o Claude atua no produto**: hoje não atua em runtime — o modelo é uma tabela empírica auditável, decisão deliberada para serviço público; próximo passo é assistente de explicação de critérios e apoio à convocação) · **Como rodar** (`schema.sql` no Supabase, `go run ./pipeline`, `go run ./back`) · **Links** (URL do Render; a ilustração *Anatomia da Fila*) · **Vídeo demo** · **O que está pronto e o que não está**: verificação de critérios em mock (`back/mocks/criterios.json`), com contrato pronto para a API real; distância da calibração por centróide de bairro; base anonimizada, então números relativos e não absolutos; corte de idade 31/03 é premissa a confirmar com a SME · **Próximos passos**: convocação rastreada com o telefone do RMI, painel do gestor, integração com o `matricula.rio`.

- [ ] **Step 4: Vídeo de 60 s** — gravar o fluxo com o CPF da Ana (`100.000.000-19`), subir no YouTube como não listado, link no README. Fazer mesmo com a URL no ar: protege contra queda na hora do pitch.

- [ ] **Step 5: Enviar** — e-mail para `eventos@taicor.ai` com o número do grupo no assunto **e** no corpo, mais o link do repositório. Antes das 16h30; reenviar se houver commit relevante depois (vale a versão mais recente).

- [ ] **Step 6: Commit final** — `git add README.md && git commit -m "docs: README de entrega e configuração de deploy" && git push`

---

## Self-review

**Cobertura do spec:** login com CPF (T8 auth) · pré-validação RMI + SME (T5, T8 `preparar`) · formulário híbrido com validadas bloqueadas (T9 Dados) · score na hora sem exibir (T8 `respostas`; o front não mostra) · referência por CEP/mapa com sugestão do RMI (T6, T8, T9 Referencia) · mapa + recomendação por proximidade × probabilidade (T7, T9 Creches) · modelo auditável calibrado (T2) · pipeline anual gravando no banco (T1–T3) · README e URL (T10).

**Consistência de tipos:** `prep.Unidade`/`prep.Modelo` são escritos pela T3 e lidos pela T4 via banco (não há acoplamento direto) · `modelo.Ref.PBase` é `[5][3]float64` em T4 e consumido assim em T7 · `verificacao.Criterio{PerguntaID,Valor,Fonte,Orgao,Referencia,Confianca}` é serializado em `inscricoes.prevalidadas` (T8 `preparar`) e desserializado no mesmo formato em `respostas` · `recomenda.Sugestao` expõe `cod,nome,bairro,lat,lon,km,p,p_pct,fator,motivo`, exatamente os campos lidos em Creches.jsx · `verificacao.Pessoa` serializa com tags minúsculas (`nome`, `nascimento`, `endereco.latitude`, `telefone`) — Referencia.jsx usa `contato.endereco?.latitude`, não `c.Lat`.

**Riscos e mitigação:**
1. **OpenFreeMap indisponível** → testar na primeira hora; fallback é trocar o `MAP_STYLE` ou usar Leaflet (~30 min).
2. **`DATABASE_URL` vazando em commit** → está no `.gitignore` desde a Task 0; se acontecer, rotacionar a senha no Supabase.
3. **Free tier do Supabase com latência** → o `Ref` é carregado uma vez no boot; só a busca geográfica vai ao banco por request.
4. **Node no runtime Go do Render** → alternativa documentada na Task 10 Step 1 (commitar `front/dist`).

**Ordem de corte se o tempo apertar:** Task 3B (é incremento, não base) → vídeo → página Concluída → camada `todas` no mapa → fallback de ampliação de raio. **Nunca cortar T8 e T9 Creches** — é a demo.
