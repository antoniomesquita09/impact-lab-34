package notifica

import (
	"bytes"
	"context"
	"errors"
	"log"
	"net/smtp"
	"strings"
	"testing"
)

func enviadorDeTeste(t *testing.T, host, de string) (*Enviador, *bytes.Buffer, *[][]byte) {
	t.Helper()
	var buf bytes.Buffer
	enviadas := &[][]byte{}
	return &Enviador{Host: host, Porta: "587", De: de,
		enviar: func(_ string, _ smtp.Auth, _ string, _ []string, msg []byte) error {
			*enviadas = append(*enviadas, msg)
			return nil
		},
		log: log.New(&buf, "", 0),
	}, &buf, enviadas
}

// Sem SMTP configurado nada sai, e o retorno diz isso — é o que impede a tela
// de afirmar que enviou.
func TestModoLogNaoEnviaEAvisa(t *testing.T) {
	e, buf, enviadas := enviadorDeTeste(t, "", "")
	if !e.ModoLog() {
		t.Fatal("sem host/from tem que ser modo log")
	}
	enviado, err := e.Enviar(context.Background(), "familia@exemplo.org", exemplo())
	if err != nil {
		t.Fatalf("modo log não é erro: %v", err)
	}
	if enviado {
		t.Fatal("modo log não pode reportar envio")
	}
	if len(*enviadas) != 0 {
		t.Fatal("modo log não pode chamar o SMTP")
	}
	if !strings.Contains(buf.String(), "MODO LOG") || !strings.Contains(buf.String(), "Ana Beatriz") {
		t.Fatalf("log deveria trazer o aviso e o comprovante:\n%s", buf.String())
	}
}

func TestSemEnderecoNaoEnviaENaoErra(t *testing.T) {
	e, buf, enviadas := enviadorDeTeste(t, "smtp.exemplo.org", "creches@rio.rj.gov.br")
	enviado, err := e.Enviar(context.Background(), "  ", exemplo())
	if err != nil || enviado || len(*enviadas) != 0 {
		t.Fatalf("sem endereço: enviado=%v err=%v chamadas=%d", enviado, err, len(*enviadas))
	}
	if !strings.Contains(buf.String(), "sem e-mail no cadastro") {
		t.Fatalf("log = %s", buf.String())
	}
}

func TestEnvioRealMontaMensagem(t *testing.T) {
	e, _, enviadas := enviadorDeTeste(t, "smtp.exemplo.org", "creches@rio.rj.gov.br")
	enviado, err := e.Enviar(context.Background(), "familia@exemplo.org", exemplo())
	if err != nil || !enviado {
		t.Fatalf("enviado=%v err=%v", enviado, err)
	}
	msg := string((*enviadas)[0])
	for _, esperado := range []string{
		"From: creches@rio.rj.gov.br", "To: familia@exemplo.org",
		"charset=UTF-8", "Subject: Confirmação da inscrição", "CP EEI Batan",
	} {
		if !strings.Contains(msg, esperado) {
			t.Fatalf("mensagem sem %q:\n%s", esperado, msg)
		}
	}
}

func TestFalhaDeEnvioViraErro(t *testing.T) {
	e, _, _ := enviadorDeTeste(t, "smtp.exemplo.org", "creches@rio.rj.gov.br")
	e.enviar = func(string, smtp.Auth, string, []string, []byte) error { return errors.New("recusado") }
	if enviado, err := e.Enviar(context.Background(), "familia@exemplo.org", exemplo()); enviado || err == nil {
		t.Fatalf("falha real tem que virar erro: enviado=%v err=%v", enviado, err)
	}
}
