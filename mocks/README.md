# Verificação de critérios por CPF

O que a Prefeitura já consegue confirmar sozinha, sem perguntar à família.

Hoje isto responde do arquivo `criterios.json`. Quando o acesso às fontes reais sair, defina
`VERIFICACAO_BASE_URL` e `VERIFICACAO_TOKEN` — o contrato da resposta é o mesmo e nada mais
no app muda. O cliente está em `internal/verificacao`.

```go
cli := verificacao.NovoDoAmbiente("mocks/criterios.json")
r, err := cli.Consultar(ctx, "100.000.000-19")   // aceita com ou sem máscara
c := r.PorPergunta()                             // map[int]Criterio, casa com a régua
c[28].Valor        // true  — está no CadÚnico
c[28].Fonte        // "CadÚnico"
c[28].Orgao        // "MDS/CAIXA"
c[28].Referencia   // "2026-03-10" — quando o dado foi apurado na origem
c[28].Confianca    // alta
```

## As 13 perguntas do processo 2025

| # | Pergunta | Pontos | Verificável | Fonte |
|---|---|---:|---|---|
| 28 | CadÚnico | **51** | alta | CadÚnico — MDS/CAIXA (o RMI já expõe) |
| 31 | Público-alvo da educação especial | 25 | **média** | cadastro de saúde + laudo — a unidade confere |
| 17 | Vítima de violência doméstica | 4 | não | — |
| 20 | Família monoparental | 4 | alta | CadÚnico, composição familiar |
| 25 | Pais ou responsáveis com deficiência | 3 | alta | BPC/INSS + marcador no CadÚnico |
| 18 | Doença crônica grave na família | 3 | **média** | e-SUS — dado sensível, exige base legal |
| 6 | Bolsa Família ou Cartão Carioca | 2 | alta | folha do PBF + cadastro do Cartão Carioca |
| 16 | Uso abusivo de álcool ou drogas | 2 | não | — |
| 12 | Familiar preso nos últimos 5 anos | 2 | não | — |
| 23 | Criança refugiada | 2 | alta | Registro Nacional Migratório — PF |
| 27 | Aguardou na fila no ano anterior | 2 | alta | **base da própria SME** |
| 29 | Irmão matriculado na rede | desempate | alta | **base da própria SME** |
| 30 | Responsável com menos de 18 anos | desempate | alta | Receita Federal |

**64 dos 100 pontos são verificáveis com confiança alta.** Mais 28 com confiança média, que
pedem conferência humana. Restam **8 pontos** genuinamente autodeclarados — e são exatamente
os três itens sensíveis (violência, drogas, familiar preso), que nenhuma base deve responder
no lugar da família.

Duas perguntas a SME já responde sozinha hoje: a 27 e a 29 saem da base dela mesma. A 27 é
onde 25,7% das famílias com direito ao ponto deixam de marcá-lo.

## CPFs de teste

Todos passam na validação de dígito verificador. Sequências repetidas (`111.111.111-11`) são
rejeitadas de propósito, como um validador real faria.

| CPF | Nome | Score | Serve para demonstrar |
|---|---|---:|---|
| `100.000.000-19` | Ana Beatriz Ramos | 59 | **caso principal**: CadÚnico, Bolsa Família, monoparental, esperou 2025. Mora em Senador Camará, longe de creche |
| `100.000.001-08` | Bruno Carvalho | 0 | contraste: nada verificado, mora em Botafogo cercado de creches |
| `100.000.002-80` | Carla Nunes | 54 | **sem endereço no cadastro** — o mapa abre no Rio inteiro até marcar o ponto. CadÚnico desatualizado |
| `100.000.003-61` | Daniel Prates | 78 | critério de **confiança média** (educação especial) que a unidade precisa conferir |
| `100.000.004-42` | Elena Ferreira | 57 | critério raro: refúgio reconhecido |
| `100.000.005-23` | Fábio Lopes | 57 | responsável com 17 anos — aciona o desempate |
| `100.000.006-04` | Iara Santos | 4 | Cartão Carioca **sem** CadÚnico: os critérios são independentes |
| `100.000.007-95` | João Vitor Alves | 89 | todos os verificáveis positivos — teto do score |
| `100.000.008-76` | — | 0 | CPF válido **sem registro**: a família responde tudo à mão |

## Como trocar pela API real

O `Cliente` chama `GET {VERIFICACAO_BASE_URL}/v1/criterios/{cpf}` com `Authorization: Bearer`.
Espera 200 com o corpo no formato de `Resposta`, ou 404 para CPF sem registro (que vira
`Encontrado: false`, não erro). Se a API real tiver outro caminho ou formato, o único arquivo
a mudar é `internal/verificacao/verificacao.go`, método `daAPI`.

Na prática a integração provavelmente será com mais de uma fonte (RMI para CadÚnico e cadastro,
base da SME para fila e irmão, PF para refúgio). O `Cliente` é o lugar de compor essas chamadas
e devolver uma resposta só — o resto do app não deve saber quantas APIs existem atrás.

## Regras que o mock respeita de propósito

- **Perguntas sensíveis nunca vêm verificadas.** Mesmo o CPF com tudo positivo não traz 17, 16
  nem 12. Há um teste que garante isso.
- **Ausência de dado não é "não".** Um critério só aparece na resposta quando alguma fonte
  sustenta o valor. O que não aparece vai para a família responder.
- **Toda afirmação carrega procedência e data.** `fonte`, `orgao` e `referencia` existem para
  a tela poder dizer de onde veio e quando — e para a família saber onde reclamar se estiver
  errado.
