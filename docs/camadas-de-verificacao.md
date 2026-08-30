# Verificação de critérios em três camadas

Análise de 30/08/2026 sobre o que a Prefeitura consegue confirmar sozinha na inscrição da
creche, sem pedir papel à família. Sustenta o módulo `internal/verificacao` e o mock
`mocks/criterios.json` (que contém a tabela pergunta a pergunta).

## Base legal — já existe, só não foi implementada

A **Lei Federal 13.444/2017** (citada na própria resolução da SME) obriga o poder público a
cruzar bases oficiais via CPF para verificar elegibilidade a políticas públicas. A Prefeitura
já torna o **CPF obrigatório** na inscrição. Ou seja: a brecha para automatizar a comprovação
dos critérios está na lei desde 2017; o que falta é integração, não autorização.

## As três camadas

Régua do processo 2025 (~100 pontos possíveis), agrupada pelo grau de automação viável:

| Grupo | O que é | Critérios | Como verificar |
|---|---|---|---|
| **A — automático** | Consultável direto por CPF/NIS em bases que já existem | CadÚnico (51) · Bolsa Família / Cartão Carioca (2) · Educação Especial (25) · aguardou na fila (2) · irmão matriculado (desempate) · monoparental (4) | RMI (CadÚnico, PBF), bases da própria SME (fila e matrículas) |
| **B — convênio** | Tecnicamente possível, mas exige acordo entre secretarias/órgãos | Doença crônica grave (3) · deficiência dos pais (3) · familiar preso (2) | SMS (e-SUS), INSS (BPC), SEAP — dados sensíveis, base legal específica |
| **C — declaratório** | Continua autodeclaração por natureza, mesmo num sistema automatizado | Violência doméstica (4) · uso abusivo de álcool/drogas (2) · criança refugiada (2)* | Só a família responde; nenhuma base deve responder no lugar dela |

Grupo A concentra **~78 dos 100 pontos**. A fila hoje é decidida quase inteira por
critérios que a Prefeitura já tem como conferir sem a família provar nada.

\* Refúgio é verificável no Registro Nacional Migratório (PF); o mock trata como confiança
alta. Está aqui como "tende a continuar declaratório" na análise original — decidir.

### Onde o mock diverge desta tabela

O `mocks/criterios.json` usa `confianca` (alta / média / não verificável) em vez de A/B/C, e
faz duas escolhas diferentes:

- **Educação Especial (25 pts)**: aqui no Grupo A; no mock é **média** — o cadastro aponta,
  mas a unidade confere o laudo. Isso muda o total "automático" de 78 para 64.
- **Deficiência dos pais (3 pts)**: aqui no Grupo B; no mock é **alta**, via BPC + marcador do
  CadÚnico, que o RMI já expõe.

Nenhuma das duas muda o argumento; muda o número que se fala no pitch. Fechar isso antes
de escrever o slide.

## A ideia central: score com carimbo de proveniência

Hoje o sistema é binário — "comprovado / não comprovado" — e sem rastro. A proposta é que
**cada critério do score carregue a sua origem**:

```
critério  →  valor  +  tipo (automático | documental | declaratório)
                    +  fonte / órgão
                    +  data de verificação
```

O que isso destrava:

- **Auditoria** — qualquer pontuação pode ser explicada linha a linha, de onde veio e quando.
- **Recurso** — a família sabe exatamente qual base está errada e onde reclamar.
- **Reaproveitamento** — um critério verificado automaticamente vale para editais futuros
  sem reprocessar documentação; só o que é declaratório ou vencido volta a ser pedido.
- **Transparência da régua** — fica explícito quanto do score é fato apurado e quanto é
  palavra da família, o que hoje é invisível.

No código, isso é o `Criterio{Valor, Fonte, Orgao, Referencia, Confianca}` de
`internal/verificacao`. Regras que o mock já respeita: ausência de dado não é "não";
perguntas sensíveis nunca vêm preenchidas por base; toda afirmação tem fonte e data.
