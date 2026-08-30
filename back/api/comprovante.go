package api

import (
	"context"
	"net/http"
	"time"

	"github.com/antoniomesquita09/impact-lab-34/back/notifica"
)

// montarComprovante lê a inscrição confirmada e monta o documento. Devolve
// também o e-mail do cadastro, que pode estar vazio — a Prefeitura não coleta
// e-mail hoje, e inventar um seria pior que não enviar.
func (a *App) montarComprovante(ctx context.Context, cpf string) (notifica.Comprovante, string, error) {
	var nome, email, grup, hor, ref *string
	var nasc *time.Time
	if err := a.Pool.QueryRow(ctx, `
		SELECT c.nome, c.email, i.grupamento, i.horario, i.ref_texto, c.nascimento
		FROM contas c JOIN inscricoes i ON i.cpf = c.cpf WHERE c.cpf=$1`,
		cpf).Scan(&nome, &email, &grup, &hor, &ref, &nasc); err != nil {
		return notifica.Comprovante{}, "", err
	}

	agora := time.Now()
	comp := notifica.Comprovante{
		Protocolo: notifica.Protocolo(cpf, agora),
		CPF:       notifica.MascararCPF(cpf),
		Em:        agora,
	}
	for destino, origem := range map[*string]*string{
		&comp.Nome: nome, &comp.Grupamento: grup, &comp.Horario: hor, &comp.Referencia: ref,
	} {
		if origem != nil {
			*destino = *origem
		}
	}

	// as opções na ordem em que a família as escolheu — a ordem É a preferência
	rows, err := a.Pool.Query(ctx, `
		SELECT o.pos, u.nome, coalesce(u.bairro,'')
		FROM inscricoes i,
		     LATERAL jsonb_array_elements_text(i.opcoes) WITH ORDINALITY AS o(cod, pos)
		JOIN unidades u ON u.cod = o.cod
		WHERE i.cpf=$1 ORDER BY o.pos`, cpf)
	if err != nil {
		return comp, valor(email), err
	}
	defer rows.Close()
	for rows.Next() {
		var op notifica.Opcao
		if err := rows.Scan(&op.Posicao, &op.Nome, &op.Bairro); err == nil {
			comp.Opcoes = append(comp.Opcoes, op)
		}
	}
	return comp, valor(email), rows.Err()
}

func valor(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// comprovante devolve o documento para a tela mostrar, imprimir ou baixar, e
// diz honestamente se algum e-mail chegou a ser enviado.
func (a *App) comprovante(w http.ResponseWriter, r *http.Request, cpf string) {
	comp, email, err := a.montarComprovante(r.Context(), cpf)
	if err != nil {
		erro(w, 400, "Conclua sua inscrição para gerar o comprovante.")
		return
	}
	if len(comp.Opcoes) == 0 {
		erro(w, 400, "Escolha suas creches para gerar o comprovante.")
		return
	}
	escreverJSON(w, 200, map[string]any{
		"protocolo": comp.Protocolo,
		"texto":     comp.Texto(),
		"assunto":   comp.Assunto(),
		// email_destino vazio = não há endereço no cadastro; modo_log = esta
		// instalação não envia e-mail nenhum. A tela precisa dos dois para não
		// prometer um envio que não aconteceu.
		"email_destino": email,
		"modo_log":      a.Email.ModoLog(),
	})
}

// enviarComprovante roda fora da requisição: o e-mail nunca segura a resposta
// da API nem derruba uma inscrição que já foi salva com sucesso.
func (a *App) enviarComprovante(cpf string) {
	ctx, cancelar := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelar()
	comp, email, err := a.montarComprovante(ctx, cpf)
	if err != nil {
		return
	}
	a.Email.Enviar(ctx, email, comp)
}
