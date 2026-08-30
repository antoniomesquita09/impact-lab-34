// Package notifica monta e envia o comprovante de inscrição. O envio é
// opcional por construção: sem SMTP configurado ele registra no log o que
// enviaria, e nada na aplicação afirma que um e-mail saiu.
package notifica

import (
	"fmt"
	"strings"
	"time"
)

type Opcao struct {
	Posicao int
	Nome    string
	Bairro  string
}

// Comprovante é o documento que a família guarda e leva na unidade. Não traz
// pontuação: a régua não é exibida à família em nenhum lugar do sistema.
type Comprovante struct {
	Protocolo  string
	Nome       string
	CPF        string
	Nascimento string
	Grupamento string
	Horario    string
	Referencia string
	Opcoes     []Opcao
	Em         time.Time
}

// MascararCPF mostra só o começo e o fim: o comprovante circula em papel e no
// e-mail, e o CPF inteiro não precisa estar nos dois.
func MascararCPF(cpf string) string {
	d := make([]rune, 0, 11)
	for _, r := range cpf {
		if r >= '0' && r <= '9' {
			d = append(d, r)
		}
	}
	if len(d) != 11 {
		return "***"
	}
	return string(d[0:3]) + ".***.***-" + string(d[9:11])
}

// Protocolo é derivado do CPF e do instante do envio — estável para a mesma
// inscrição e suficiente para a família citar ao ligar para a unidade.
func Protocolo(cpf string, em time.Time) string {
	d := ""
	for _, r := range cpf {
		if r >= '0' && r <= '9' {
			d += string(r)
		}
	}
	if len(d) < 11 {
		d = "00000000000"
	}
	return fmt.Sprintf("%s-%s", em.Format("20060102"), d[3:9])
}

func (c Comprovante) Assunto() string {
	return "Confirmação da inscrição em creche · protocolo " + c.Protocolo
}

// Texto é o corpo do comprovante. Escrito para ser lido por quem não conhece o
// processo: sem sigla, sem jargão e sem prometer vaga.
func (c Comprovante) Texto() string {
	var b strings.Builder
	p := func(f string, a ...any) { fmt.Fprintf(&b, f+"\n", a...) }

	p("INSCRIÇÃO EM CRECHE — COMPROVANTE DE ENVIO")
	p("")
	p("Protocolo: %s", c.Protocolo)
	p("Enviado em: %s", c.Em.Format("02/01/2006 às 15:04"))
	p("")
	p("Responsável: %s", c.Nome)
	p("CPF: %s", c.CPF)
	if c.Nascimento != "" {
		p("Nascimento da criança: %s", c.Nascimento)
	}
	p("Turma: %s · %s", c.Grupamento, c.Horario)
	if c.Referencia != "" {
		p("Local de referência: %s", c.Referencia)
	}
	p("")
	p("CRECHES ESCOLHIDAS, NA SUA ORDEM DE PREFERÊNCIA:")
	for _, o := range c.Opcoes {
		if o.Bairro != "" {
			p("  %dª  %s — %s", o.Posicao, o.Nome, o.Bairro)
		} else {
			p("  %dª  %s", o.Posicao, o.Nome)
		}
	}
	p("")
	p("O QUE ACONTECE AGORA")
	p("Sua inscrição foi registrada. A convocação é feita pela unidade, que")
	p("entra em contato pelos dados do seu cadastro. Mantenha seu telefone")
	p("atualizado e guarde este protocolo.")
	p("")
	p("Esta inscrição não garante vaga: ela entra na fila junto com as demais.")
	return b.String()
}
