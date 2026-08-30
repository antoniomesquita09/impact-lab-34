package notifica

import (
	"strings"
	"testing"
	"time"
)

func exemplo() Comprovante {
	em := time.Date(2026, 8, 30, 16, 5, 0, 0, time.UTC)
	return Comprovante{
		Protocolo: Protocolo("10000000019", em), Nome: "Ana Beatriz Ramos",
		CPF: MascararCPF("100.000.000-19"), Nascimento: "10/06/2025",
		Grupamento: "Berçário", Horario: "Integral", Referencia: "Senador Camará, Rio de Janeiro",
		Opcoes: []Opcao{{1, "CP EEI Batan", "Realengo"}, {2, "EDI Medalhista", "Santíssimo"}},
		Em:     em,
	}
}

func TestMascararCPF(t *testing.T) {
	if got := MascararCPF("100.000.000-19"); got != "100.***.***-19" {
		t.Fatalf("máscara = %q", got)
	}
	if got := MascararCPF("123"); got != "***" {
		t.Fatalf("CPF curto = %q", got)
	}
}

func TestProtocoloEstavel(t *testing.T) {
	em := time.Date(2026, 8, 30, 16, 5, 0, 0, time.UTC)
	a, b := Protocolo("10000000019", em), Protocolo("100.000.000-19", em)
	if a != b {
		t.Fatalf("formatação do CPF não pode mudar o protocolo: %s vs %s", a, b)
	}
	if !strings.HasPrefix(a, "20260830-") {
		t.Fatalf("protocolo = %q", a)
	}
}

func TestTextoTemTudoQueAFamiliaPrecisa(t *testing.T) {
	txt := exemplo().Texto()
	for _, esperado := range []string{
		"20260830-000000", "Ana Beatriz Ramos", "100.***.***-19", "30/08/2026",
		"Berçário", "Integral", "Senador Camará",
		"1ª  CP EEI Batan — Realengo", "2ª  EDI Medalhista — Santíssimo",
		"não garante vaga",
	} {
		if !strings.Contains(txt, esperado) {
			t.Fatalf("comprovante não traz %q:\n%s", esperado, txt)
		}
	}
}

// A régua não é exibida à família em lugar nenhum do sistema — nem aqui.
func TestTextoNaoTrazPontuacao(t *testing.T) {
	txt := strings.ToLower(exemplo().Texto())
	for _, proibido := range []string{"pontua", "score", "pontos", "classifica"} {
		if strings.Contains(txt, proibido) {
			t.Fatalf("comprovante menciona %q, e não deveria:\n%s", proibido, txt)
		}
	}
}

func TestCPFInteiroNuncaAparece(t *testing.T) {
	if strings.Contains(exemplo().Texto(), "10000000019") {
		t.Fatal("CPF sem máscara vazou no comprovante")
	}
}
