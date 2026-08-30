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

-- Capacidade e vaga ociosa por unidade × grupamento × turno (Task 3B).
-- Só existe linha onde há fonte: unidade sem dado fica de fora, nunca com zero —
-- a tela não pode dizer "0 vagas ociosas" quando o que houve foi ausência de fonte.
-- referencia carrega a data da fonte, que viaja junto com o número até a interface.
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
