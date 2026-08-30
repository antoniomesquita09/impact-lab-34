# pipeline

Ingestão anual: lê os dados brutos da SME em `dados/` (symlink, fora do git), agrega por unidade,
calibra o modelo de probabilidade e grava tudo no Postgres numa única transação.

**Não faz parte do runtime.** O servidor nunca lê CSV — só o Postgres. Este binário roda uma vez
por ano, antes de abrir o processo de matrícula.

```bash
go run ./pipeline -n      # simulação: calcula e imprime, não toca no banco, não exige DATABASE_URL
go run ./pipeline         # grava (precisa de DATABASE_URL)

go run ./pipeline -ano 2024 -qa outra/base.csv.gz -loc outras/coordenadas.xlsx
```

Leva ~1,1 s para as 837.179 linhas da Query A. Importa `back/db` (só o pool `pgx`).

## O que ele produz

| Tabela | Linhas | Conteúdo |
|---|---:|---|
| `unidades` | 852 | catálogo com coordenada, `taxa_ref` e `n_ref` (820 têm taxa) |
| `unidade_oferta` | 2.138 | grupamento × horário observados no ano de referência |
| `perguntas` | 13 | régua 2025 (`prm_id` 195), soma 100 pontos |
| `modelo_prob` | 15 | matriz posição da opção × faixa de distância |
| `modelo_meta` | 2 | `mediana_taxa_ref` = 0,341 · `calibrado_em` = 2021-2025 |

Matriz calibrada (probabilidade de a opção virar matrícula confirmada):

| Opção | < 2 km | 2–5 km | ≥ 5 km |
|---|---:|---:|---:|
| 1ª | 0,404 | 0,379 | 0,334 |
| 2ª | 0,175 | 0,154 | 0,134 |
| 3ª | 0,124 | 0,106 | 0,083 |
| 4ª | 0,096 | 0,074 | 0,063 |
| 5ª | 0,086 | 0,067 | 0,056 |

Decresce nas duas direções, e é esse o ponto: **a distância prevê matrícula, e o formulário atual
não pergunta.** A quinta opção de uma família vale menos de um sexto da primeira — não porque a
criança desista, mas porque a cauda da lista é preenchimento, fica longe e morre.

`Gravar` é idempotente e transacional: `TRUNCATE` + recarga dentro de uma transação. Ou o banco
fica com o resultado completo da rodada, ou intacto. Rodar duas vezes dá o mesmo estado. Se a
agregação devolver zero unidades ou régua vazia, ele recusa gravar em vez de esvaziar o banco.

## Limitações declaradas

- **A distância da calibração é uma proxy.** A base anonimizada não traz o endereço da família —
  só o bairro. Usamos a distância da unidade ao *centróide do bairro declarado* (média das
  coordenadas das unidades daquele bairro). Em produção a coordenada real vem do RMI ou do CEP,
  e a matriz deve ser recalibrada com ela.
- **O bairro da família e o da unidade têm granularidades diferentes.** 1.399 crianças declaram
  `JACAREPAGUA`, onde o cadastro de unidades só conhece Anil, Taquara, Tanque, Praça Seca e
  Gardênia Azul. Opções cujo bairro não ancora em nenhuma unidade ficam fora da calibração.
- **A pontuação social não entra na probabilidade.** Em 2025 a régua não separa mais ninguém:
  quem pontua e quem não pontua entra na mesma taxa (67,7%). Fingir que o score prevê entrada
  seria mentir para a família.
- **A régua mudou de natureza entre 2023 e 2024** — os critérios de 100 pontos saíram e entrou o
  CadÚnico. A matriz é calibrada em 2021–2025 porque a relação distância×posição é estável no
  período; a régua gravada é só a de 2025.

## Armadilhas dos dados brutos, já tratadas no código

- Query A: separador `;`, UTF-8 **com BOM** no primeiro cabeçalho, aspas frouxas.
- Junção unidade ↔ coordenada é `strings.TrimLeft(cod, "0")`. A junção direta casa 150 de 872.
- O xlsx de coordenadas traz a E.M. Pedro Bruno (Paquetá) com lat/lon `(0,0)`. `NoRio` a descarta —
  sem isso ela cairia no golfo da Guiné e envenenaria o ranking por distância.
- Existem 11 linhas com `opcao = 6`; ficam fora da matriz 5×3.
- `bairro` é nulo em 2,8% das linhas.
- Só `situacao = 'Confirmado'` conta como matrícula. Cancelamentos são a maioria da base, e o
  status vem gravado como `Cancelado na confirmacao` — sem cedilha e sem til.
