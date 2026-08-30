package prep

import (
	"context"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Pergunta é uma linha da régua de pontuação vigente.
type Pergunta struct {
	ID, Pontos, Ordem int
	Texto             string
	Desempate         bool
	Validavel         bool
}

// ReguaPadrao é a régua do processo 2025 (prm_id 195). Soma 100 pontos.
// Validavel marca o que a Prefeitura consegue conferir sozinha (camada A ou B de
// docs/camadas-de-verificacao.md); o resto continua declaratório.
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

// Gravar substitui todos os dados de referência numa única transação: ou o banco
// fica com o resultado completo desta rodada, ou intacto. Idempotente.
func Gravar(ctx context.Context, pool *pgxpool.Pool, uns []Unidade, m Modelo, perguntas []Pergunta) error {
	if len(uns) == 0 {
		return fmt.Errorf("nenhuma unidade para gravar — recusando apagar o que está no banco")
	}
	if len(perguntas) == 0 {
		return fmt.Errorf("régua vazia — recusando apagar o que está no banco")
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// unidade_oferta some junto pelo CASCADE, mas TRUNCATE explícito deixa a ordem clara.
	for _, q := range []string{
		"TRUNCATE unidade_oferta", "TRUNCATE unidades CASCADE",
		"TRUNCATE perguntas", "TRUNCATE modelo_prob", "TRUNCATE modelo_meta",
	} {
		if _, err := tx.Exec(ctx, q); err != nil {
			return fmt.Errorf("%s: %w", q, err)
		}
	}

	// CopyFrom não aceita expressão SQL, e geom precisa de ST_MakePoint — daí um
	// batch de INSERTs. Um batch só: uma ida ao servidor, não uma por unidade.
	lote := &pgx.Batch{}
	for _, u := range uns {
		lote.Queue(`INSERT INTO unidades (cod,nome,bairro,cre,tipo,geom,taxa_ref,n_ref)
			VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_MakePoint($6,$7),4326)::geography, $8,$9)`,
			u.Cod, u.Nome, u.Bairro, u.CRE, u.Tipo, u.Lon, u.Lat, u.TaxaRef, u.NRef)
	}
	res := tx.SendBatch(ctx, lote)
	for i := range uns {
		if _, err := res.Exec(); err != nil {
			res.Close()
			return fmt.Errorf("insert unidade %s: %w", uns[i].Cod, err)
		}
	}
	if err := res.Close(); err != nil {
		return fmt.Errorf("insert unidades: %w", err)
	}

	rowsO := make([][]any, 0, len(uns)*4)
	for _, u := range uns {
		for _, o := range u.Oferta {
			rowsO = append(rowsO, []any{u.Cod, o.Grupamento, o.Horario})
		}
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
				pos+1, f, m.PBase[pos][f]); err != nil {
				return fmt.Errorf("insert modelo_prob %d/%d: %w", pos+1, f, err)
			}
		}
	}
	for k, v := range map[string]string{
		"mediana_taxa_ref": strconv.FormatFloat(m.Mediana, 'f', 6, 64),
		"calibrado_em":     m.CalibradoEm,
	} {
		if _, err := tx.Exec(ctx, `INSERT INTO modelo_meta (chave,valor) VALUES ($1,$2)`, k, v); err != nil {
			return fmt.Errorf("insert modelo_meta %s: %w", k, err)
		}
	}
	return tx.Commit(ctx)
}
