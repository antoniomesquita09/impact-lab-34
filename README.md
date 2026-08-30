# Matrícula Carioca — Inteligência na Fila da Creche

**Equipe 34** · Claude Impact Lab Rio, 2ª edição · 30/08/2026

<!-- TODO: nomes dos 4 membros da equipe -->

- **Aplicação:** <!-- TODO: URL do Render, quando publicada -->
- **Vídeo demo (60s):** <!-- TODO: link -->

---

## O problema

A rede municipal tem vagas ociosas **e** fila de espera ao mesmo tempo. Não é só escassez: é
descompasso entre onde a vaga está e onde a família mora. Mais de 45 mil inscrições disputam 872
unidades, e cada família escolhe até 5 creches **sem que o sistema diga a distância de nenhuma
delas**.

Medimos o efeito disso nos 837.179 registros de escolha dos processos de 2021 a 2025:

| Opção | Creche no mesmo bairro | Creche em outro bairro |
|---|---:|---:|
| 1ª | 42,7% | 31,8% |
| 5ª | 8,3% | 6,9% |

A proporção de escolhas no próprio bairro cai de 60,1% na 1ª opção para 42,8% na 5ª. A cauda da
lista é preenchimento: fica longe e morre. **A distância prevê a matrícula, e o formulário não
pergunta.**

## A solução

Um novo fluxo de inscrição onde a família entra com CPF, tem os critérios pré-validados contra as
bases que a Prefeitura já tem, responde só o que falta, informa um local de referência (a casa, o
trabalho, a casa da avó) e recebe **no mapa** as creches ordenadas por proximidade × probabilidade
real de conseguir a vaga.

Três mudanças em relação ao processo atual:

1. **A família vê a distância antes de escolher**, não depois de perder a vaga.
2. **A probabilidade é calibrada em 5 anos de dados reais**, não é um chute — e é mostrada como
   probabilidade, não como promessa.
3. **O que a Prefeitura já sabe, ela não pergunta de novo.** Os critérios verificáveis vêm das
   bases; o formulário fica com o que só a família pode responder.

## Arquitetura

Duas peças independentes, um `go.mod` na raiz.

```
pipeline/   ingestão anual: dados brutos da SME → Postgres      go run ./pipeline
back/       API Go (stdlib net/http) + serve o front            go run ./back
front/      Vite + React + MapLibre GL JS                       cd front && npm run dev
```

O **pipeline não faz parte do runtime**. Ele roda uma vez por ano, lê os CSVs e planilhas da SME,
agrega, calibra o modelo e grava tudo no Postgres numa única transação. O servidor nunca lê CSV —
só o banco. A busca geográfica é `ST_DWithin` no PostGIS; a fórmula de probabilidade fica em Go,
testável e auditável, e não numa query.

**Stack:** Go 1.25 (`net/http`, `pgx/v5`, `excelize/v2`, `bcrypt`) · Supabase (Postgres + PostGIS) ·
Vite + React + MapLibre com tiles do OpenFreeMap · deploy no Render.

Detalhes do pipeline e do modelo: [`pipeline/README.md`](pipeline/README.md).
Verificação de critérios em 3 camadas e base legal: [`docs/camadas-de-verificacao.md`](docs/camadas-de-verificacao.md).
Plano de implementação completo: [`docs/PLAN.md`](docs/PLAN.md).

### O modelo de probabilidade

Calibrado nas 837.179 opções de 2021–2025. `p = clamp(p_base[posição][faixa de distância] × fator, 0.02, 0.95)`,
onde o fator ajusta pela taxa histórica da unidade (mediana 0,341) e vale 1,0 quando a unidade tem
menos de 20 inscrições no ano de referência.

| Opção | < 2 km | 2–5 km | ≥ 5 km |
|---|---:|---:|---:|
| 1ª | 0,404 | 0,379 | 0,334 |
| 5ª | 0,086 | 0,067 | 0,056 |

**A pontuação social não entra na probabilidade.** Em 2025 a régua não separa mais ninguém: quem
pontua e quem não pontua entra na mesma taxa (67,7%). Fazer o score parecer preditivo seria mentir
para a família.

## Como o Claude foi usado

**Para construir o projeto.** O trabalho do dia foi conduzido em sessões paralelas do Claude Code
(pipeline, back, front e uma sessão orquestradora), conversando entre si para congelar os contratos
entre as frentes antes de escrever código — schema ↔ pipeline ↔ API. A exploração das bases veio
antes da implementação e produziu os achados que sustentam o produto: foi assim que descobrimos que
`esc_codigo` não é chave única, que a junção unidade↔coordenada precisa de `TrimLeft(cod, "0")` (a
junção direta casa 150 de 872), que o status vem gravado como `Cancelado na confirmacao` sem cedilha
e sem til, e que a régua de pontuação mudou de natureza entre 2023 e 2024. Cada armadilha dessas
virou um teste. O desenvolvimento foi guiado por testes contra os dados reais, não por fixtures
otimistas.

**Dentro da aplicação.** Hoje, nenhum. Buscamos por `anthropic|claude|openai|llm|gpt|completion|
prompt` em todo o código de `back/`, `pipeline/` e `front/`: zero ocorrência. As duas únicas chamadas
de rede em runtime são a BrasilAPI (geocodificação de CEP) e a API de verificação de critérios por
CPF — nenhum modelo é chamado em tempo de execução.

Isso é uma escolha, não uma lacuna. Uma decisão que define a posição de uma criança na fila precisa
ser reproduzível, explicável para a família e auditável pelo controle interno. Um LLM no caminho do
score seria exatamente o que a SME não consegue auditar. O que decide, aqui, é determinístico: a
régua de pontuação lida do banco, `ST_DWithin` no PostGIS e uma matriz 5×3 calibrada sobre 5 anos de
dados reais. `Probabilidade()` são 15 linhas de Go, com piso, teto e teste — cabe num parecer.

O lugar natural para o Claude operar dentro do produto, num próximo passo, é onde há **texto e não
decisão**: explicar em linguagem simples por que aquela creche foi recomendada, e apoiar o servidor
da CRE na fase de convocação, que hoje é manual e sem rastreio. Não está implementado, e o README
não vai fingir que está.

## Como rodar

Sem banco nenhum, para ver o modelo sair dos dados brutos:

```bash
go test ./...                 # suíte completa; o pipeline testa contra as bases reais
go run ./pipeline -n          # calcula e imprime o modelo, SEM tocar no banco
```

Completo, com um Postgres com PostGIS:

```bash
cp .env.example .env                  # preencha DATABASE_URL; .env está no .gitignore
export DATABASE_URL='...'
psql "$DATABASE_URL" -f schema.sql    # uma vez (ou colar no SQL Editor do Supabase)
go run ./pipeline                     # carrega os dados de referência (idempotente)
cd front && npm run build && cd ..
go run ./back                         # sobe em :8080: API + front/dist com fallback SPA
```

O front em desenvolvimento: <!-- TODO (sessão do front): comandos de dev -->

### Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | Postgres do Supabase (Session pooler, porta 5432). Nunca em commit; no Render vai em Environment com `sync: false`. |
| `PORT` | não | Porta do servidor; padrão 8080. |
| `VERIFICACAO_BASE_URL` e `VERIFICACAO_TOKEN` | não | Endereço e token da API real de verificação de critérios. **Sem as duas, a verificação responde do mock** `back/mocks/criterios.json`, e o servidor loga `verificação de critérios: MOCK` no boot — de propósito, para a demo não passar por real o que não é. |

### Endpoints

`GET /api/health` · `POST /api/auth/registrar` · `POST /api/auth/entrar` · `GET /api/eu` ·
`GET /api/inscricao/preparar` · `POST /api/inscricao/respostas` · `POST /api/inscricao/referencia` ·
`GET /api/inscricao/recomendacoes` · `POST /api/inscricao/opcoes` · `GET /api/inscricao`

Os dados brutos (clone de [`CIT-SME-RJ/dadoscreche`](https://github.com/CIT-SME-RJ/dadoscreche),
68 MB) ficam **fora deste repositório**, acessíveis por um symlink `dados/` que está no
`.gitignore`. Nenhuma credencial entra em commit: este repositório é público.

## Estado atual — o que está de pé e o que não está

Honestidade sobre hoje vs. próximos passos, porque a diferença importa:

**Funciona e está testado:**
- O pipeline inteiro, ponta a ponta, contra as bases reais: lê 837.179 linhas, calibra o modelo e
  monta 3.046 linhas de capacidade em ~1,2 s. Reproduz os números oficiais da SME.
- A API e a fórmula de recomendação, com testes.

**Ainda não está de pé:**
- <!-- TODO: atualizar quando o Supabase e o Render existirem -->
  O banco de produção ainda não foi provisionado, então o pipeline nunca gravou de verdade e a
  aplicação não está publicada. Enquanto isso não mudar, este README não afirma o contrário.
- Por consequência, 6 testes de integração da API estão em `SKIP`: eles sobem contra o banco real e
  limpam o que criam. Três destravam com o schema aplicado; os outros três, depois que o pipeline
  rodar. Nenhum deles foi desabilitado para "ficar verde".

## O que esta versão ainda não faz

- **A distância usada para calibrar o modelo é uma proxy.** A base anonimizada não traz o endereço
  da família, só o bairro; usamos a distância da unidade ao centróide do bairro declarado. Em
  produção a coordenada real vem do RMI ou do CEP, e o modelo deve ser recalibrado com ela. A
  direção do efeito é sólida; a magnitude exata, não.
- **Bairro da família e bairro da unidade têm granularidades diferentes.** 1.399 crianças declaram
  `JACAREPAGUA`, onde o cadastro de unidades só conhece Anil, Taquara, Tanque, Praça Seca e Gardênia
  Azul. Opções cujo bairro não ancora em nenhuma unidade ficam fora da calibração.
- **A capacidade não tem fonte por turno.** Nenhuma base pública publica isso. Onde a unidade tem
  matrícula num turno só, o número está certo (é o caso da maioria); onde é mista, rateamos pela
  proporção observada; onde a fonte não informa, a linha é marcada como inferida e a tela não deve
  afirmar o turno.
- **As três fontes de capacidade têm datas diferentes** — capacidade pública de 11/07/2025, meta das
  parceiras de maio/2025, matrícula do SGA dinâmica. Cada linha carrega a sua data, e isso precisa
  aparecer na interface, não ficar escondido.
- **As vagas ociosas das parceiras não são somáveis por grupamento.** Por creche o número é sólido;
  a soma da nossa tabela (3.055) fica acima do total oficial da planilha (1.665) porque este desconta
  abatimentos que a fonte só reporta agregados, e superlotação num grupamento não compensa vaga em
  outro.
- **`confirmado` não é comparável entre anos.** A proporção de inscrições com ao menos um critério
  confirmado cai de 57,7% (2021) para 10,1% (2025) — mudança de processo, não de população. Nenhum
  indicador nosso depende desse campo.
- **A verificação de critérios por CPF roda contra um mock** com 9 CPFs de teste. O contrato é o da
  API real (`GET {base}/v1/criterios/{cpf}` com Bearer); trocar é definir duas variáveis de
  ambiente, sem mudar uma linha de código de aplicação.
- **O corte de idade para grupamento (31/03, inclusivo) é premissa nossa**, ainda não confirmada
  com a SME.
- **O processo vigente (2026) não está nos dados.** O modelo é calibrado até 2025.

## Dados e fontes

- [`CIT-SME-RJ/dadoscreche`](https://github.com/CIT-SME-RJ/dadoscreche) — inscrição, classificação,
  unidades e oferecimentos dos processos de 2021 a 2025.
- [Transparência–Creches da SME](https://educacao.prefeitura.rio/transparenciacreches/) — capacidade
  oficial por grupamento das 488 unidades públicas (53.432 vagas, referência 11/07/2025). Fonte
  externa ao repositório do desafio.

Os dados são anonimizados por códigos artificiais estáveis entre processos. Isso preserva a
trajetória de uma mesma criança entre anos, a lógica territorial em nível de bairro e a dinâmica de
transição de status — mas **não** permite indicadores absolutos, identidade, endereço exato nem
contagem exata de crianças. Nenhuma conclusão aqui depende do que a anonimização não sustenta.
