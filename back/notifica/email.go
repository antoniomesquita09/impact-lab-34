package notifica

import (
	"context"
	"fmt"
	"log"
	"net/smtp"
	"os"
	"strings"
)

// Enviador manda o comprovante por SMTP. Sem SMTP_HOST/SMTP_FROM configurados
// ele entra em MODO LOG: registra o comprovante inteiro no log do servidor e
// NÃO envia nada. Quem chama precisa saber disso — veja ModoLog — porque a tela
// nunca pode afirmar que enviou um e-mail que não saiu.
type Enviador struct {
	Host, Porta, Usuario, Senha, De string
	// enviar é injetável para o teste não abrir conexão de rede.
	enviar func(addr string, a smtp.Auth, de string, para []string, msg []byte) error
	log    *log.Logger
}

func NovoDoAmbiente() *Enviador {
	return &Enviador{
		Host:    os.Getenv("SMTP_HOST"),
		Porta:   ou(os.Getenv("SMTP_PORT"), "587"),
		Usuario: os.Getenv("SMTP_USER"),
		Senha:   os.Getenv("SMTP_PASS"),
		De:      os.Getenv("SMTP_FROM"),
		enviar:  smtp.SendMail,
		log:     log.Default(),
	}
}

func ou(v, padrao string) string {
	if v == "" {
		return padrao
	}
	return v
}

// ModoLog indica que nenhum e-mail sai desta instalação.
func (e *Enviador) ModoLog() bool { return e.Host == "" || e.De == "" }

// Enviar devolve enviado=false, sem erro, quando está em modo log ou quando não
// há endereço — as duas situações são normais hoje, não falhas. Erro só quando
// a tentativa real de envio falha.
func (e *Enviador) Enviar(ctx context.Context, para string, c Comprovante) (enviado bool, err error) {
	if strings.TrimSpace(para) == "" {
		e.log.Printf("comprovante %s: sem e-mail no cadastro, nada enviado\n%s", c.Protocolo, c.Texto())
		return false, nil
	}
	if e.ModoLog() {
		e.log.Printf("comprovante %s [MODO LOG — nenhum e-mail enviado] para %s\nAssunto: %s\n%s",
			c.Protocolo, para, c.Assunto(), c.Texto())
		return false, nil
	}
	msg := []byte("From: " + e.De + "\r\n" +
		"To: " + para + "\r\n" +
		"Subject: " + c.Assunto() + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n\r\n" +
		c.Texto())
	var auth smtp.Auth
	if e.Usuario != "" {
		auth = smtp.PlainAuth("", e.Usuario, e.Senha, e.Host)
	}
	if err := e.enviar(e.Host+":"+e.Porta, auth, e.De, []string{para}, msg); err != nil {
		return false, fmt.Errorf("envio do comprovante %s: %w", c.Protocolo, err)
	}
	return true, nil
}
