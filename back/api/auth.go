package api

import (
	"crypto/rand"
	"net/http"
	"strings"
	"time"

	"encoding/base64"

	"golang.org/x/crypto/bcrypt"
)

func soDigitos(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func novoToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (a *App) abrirSessao(r *http.Request, cpf string) (string, error) {
	tok, err := novoToken()
	if err != nil {
		return "", err
	}
	if _, err := a.Pool.Exec(r.Context(), `INSERT INTO sessoes (token,cpf) VALUES ($1,$2)`, tok, cpf); err != nil {
		return "", err
	}
	return tok, nil
}

func (a *App) registrar(w http.ResponseWriter, r *http.Request) {
	var in struct{ CPF, Nome, Nascimento, Senha string }
	if err := lerJSON(r, &in); err != nil {
		erro(w, 400, "Não entendi os dados enviados.")
		return
	}
	cpf := soDigitos(in.CPF)
	if len(cpf) != 11 {
		erro(w, 400, "O CPF precisa ter 11 dígitos.")
		return
	}
	if strings.TrimSpace(in.Nome) == "" || in.Senha == "" {
		erro(w, 400, "Preencha nome e senha.")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Senha), bcrypt.DefaultCost)
	if err != nil {
		erro(w, 500, "Não conseguimos criar a conta. Tente de novo.")
		return
	}

	var nasc any
	if t, err := time.Parse("2006-01-02", in.Nascimento); err == nil {
		nasc = t
	}
	if _, err := a.Pool.Exec(r.Context(),
		`INSERT INTO contas (cpf,nome,nascimento,senha_hash) VALUES ($1,$2,$3,$4)`,
		cpf, in.Nome, nasc, string(hash)); err != nil {
		erro(w, 409, "Já existe conta para este CPF. Entre com a sua senha.")
		return
	}
	tok, err := a.abrirSessao(r, cpf)
	if err != nil {
		erro(w, 500, "Conta criada, mas não conseguimos entrar. Tente entrar de novo.")
		return
	}
	escreverJSON(w, 200, map[string]string{"token": tok, "nome": in.Nome})
}

func (a *App) entrar(w http.ResponseWriter, r *http.Request) {
	var in struct{ CPF, Senha string }
	if err := lerJSON(r, &in); err != nil {
		erro(w, 400, "Não entendi os dados enviados.")
		return
	}
	cpf := soDigitos(in.CPF)
	var nome, hash string
	err := a.Pool.QueryRow(r.Context(), `SELECT nome,senha_hash FROM contas WHERE cpf=$1`, cpf).Scan(&nome, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Senha)) != nil {
		erro(w, 401, "CPF ou senha incorretos.")
		return
	}
	tok, err := a.abrirSessao(r, cpf)
	if err != nil {
		erro(w, 500, "Não conseguimos abrir sua sessão. Tente de novo.")
		return
	}
	escreverJSON(w, 200, map[string]string{"token": tok, "nome": nome})
}

func (a *App) autenticado(h func(http.ResponseWriter, *http.Request, string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if tok == "" {
			erro(w, 401, "Entre com seu CPF para continuar.")
			return
		}
		var cpf string
		if err := a.Pool.QueryRow(r.Context(), `SELECT cpf FROM sessoes WHERE token=$1`, tok).Scan(&cpf); err != nil {
			erro(w, 401, "Sua sessão expirou. Entre de novo.")
			return
		}
		h(w, r, cpf)
	}
}

func (a *App) eu(w http.ResponseWriter, r *http.Request, cpf string) {
	var nome string
	a.Pool.QueryRow(r.Context(), `SELECT nome FROM contas WHERE cpf=$1`, cpf).Scan(&nome)
	escreverJSON(w, 200, map[string]string{"cpf": cpf, "nome": nome})
}
