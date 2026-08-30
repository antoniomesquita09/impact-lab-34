// Package verificacao consulta, por CPF, os critérios de vulnerabilidade que a
// Prefeitura já consegue confirmar sozinha — sem pedir à família.
//
// Hoje responde de um mock (mocks/criterios.json). Quando o acesso às fontes reais
// sair, basta definir VERIFICACAO_BASE_URL e VERIFICACAO_TOKEN: o contrato da
// resposta é o mesmo, e nada mais no app precisa mudar.
//
// Das 13 perguntas do processo 2025 (100 pontos):
//
//	64 pontos são verificáveis com confiança alta  (28, 6, 20, 25, 23, 27, 29, 30)
//	28 pontos com confiança média, exigem conferência humana (31, 18)
//	 8 pontos não são verificáveis e seguem autodeclarados (17, 16, 12)
package verificacao

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type Confianca string

const (
	Alta           Confianca = "alta"
	Media          Confianca = "media"
	NaoVerificavel Confianca = "nao_verificavel"
)

// Criterio é uma resposta que a Prefeitura confirmou por conta própria.
type Criterio struct {
	PerguntaID int       `json:"pergunta_id"`
	Valor      bool      `json:"valor"`
	Fonte      string    `json:"fonte"`
	Orgao      string    `json:"orgao"`
	Referencia string    `json:"referencia"`
	Confianca  Confianca `json:"confianca"`
	Detalhe    string    `json:"detalhe,omitempty"`
}

type Endereco struct {
	Logradouro string   `json:"logradouro"`
	Numero     string   `json:"numero"`
	Bairro     string   `json:"bairro"`
	CEP        string   `json:"cep"`
	Latitude   *float64 `json:"latitude"`
	Longitude  *float64 `json:"longitude"`
}

type Telefone struct {
	DDD          string `json:"ddd"`
	Numero       string `json:"numero"`
	AtualizadoEm string `json:"atualizado_em"`
}

type Pessoa struct {
	Nome       string    `json:"nome"`
	Nascimento string    `json:"nascimento"`
	MenorIdade bool      `json:"menor_idade"`
	Endereco   *Endereco `json:"endereco"`
	Telefone   *Telefone `json:"telefone"`
}

// Resposta é o contrato que o app espera — do mock e da API real.
type Resposta struct {
	CPF          string     `json:"cpf"`
	Encontrado   bool       `json:"encontrado"`
	ConsultadoEm time.Time  `json:"consultado_em"`
	Pessoa       *Pessoa    `json:"pessoa"`
	Criterios    []Criterio `json:"criterios"`
	// NaoVerificaveis lista as perguntas que nenhuma base responde: a família decide.
	NaoVerificaveis []int `json:"nao_verificaveis"`
}

// PorPergunta indexa os critérios pelo id da pergunta, para casar com a régua.
func (r *Resposta) PorPergunta() map[int]Criterio {
	m := make(map[int]Criterio, len(r.Criterios))
	for _, c := range r.Criterios {
		m[c.PerguntaID] = c
	}
	return m
}

type Cliente struct {
	baseURL, token string
	http           *http.Client
	mockPath       string
	once           sync.Once
	mock           map[string]Resposta
	naoVerificavel []int
	erroMock       error
}

// NovoCliente devolve o cliente real se baseURL e token vierem preenchidos;
// caso contrário lê o mock de mockPath.
func NovoCliente(baseURL, token, mockPath string) *Cliente {
	return &Cliente{
		baseURL:  baseURL,
		token:    token,
		mockPath: mockPath,
		http:     &http.Client{Timeout: 10 * time.Second},
	}
}

// NovoDoAmbiente monta o cliente a partir de VERIFICACAO_BASE_URL e VERIFICACAO_TOKEN.
func NovoDoAmbiente(mockPath string) *Cliente {
	return NovoCliente(os.Getenv("VERIFICACAO_BASE_URL"), os.Getenv("VERIFICACAO_TOKEN"), mockPath)
}

func (c *Cliente) UsandoMock() bool { return c.baseURL == "" || c.token == "" }

// Consultar devolve os critérios já confirmados para o CPF.
// CPF inválido devolve erro; CPF válido sem registro devolve Encontrado=false, sem erro.
func (c *Cliente) Consultar(ctx context.Context, cpf string) (*Resposta, error) {
	limpo := SoDigitos(cpf)
	if !CPFValido(limpo) {
		return nil, fmt.Errorf("CPF inválido")
	}
	if c.UsandoMock() {
		return c.doMock(limpo)
	}
	return c.daAPI(ctx, limpo)
}

func (c *Cliente) doMock(cpf string) (*Resposta, error) {
	c.once.Do(c.carregarMock)
	if c.erroMock != nil {
		return nil, c.erroMock
	}
	r, ok := c.mock[cpf]
	if !ok {
		return &Resposta{CPF: cpf, Encontrado: false, ConsultadoEm: time.Now(),
			NaoVerificaveis: c.naoVerificavel}, nil
	}
	r.ConsultadoEm = time.Now()
	r.NaoVerificaveis = c.naoVerificavel
	return &r, nil
}

func (c *Cliente) carregarMock() {
	b, err := os.ReadFile(c.mockPath)
	if err != nil {
		c.erroMock = fmt.Errorf("mock de verificação não encontrado em %s: %w", c.mockPath, err)
		return
	}
	var arquivo struct {
		NaoVerificaveis []int      `json:"_nao_verificaveis"`
		Cidadaos        []Resposta `json:"cidadaos"`
	}
	if err := json.Unmarshal(b, &arquivo); err != nil {
		c.erroMock = fmt.Errorf("mock de verificação inválido: %w", err)
		return
	}
	c.naoVerificavel = arquivo.NaoVerificaveis
	c.mock = make(map[string]Resposta, len(arquivo.Cidadaos))
	for _, r := range arquivo.Cidadaos {
		c.mock[SoDigitos(r.CPF)] = r
	}
}

func (c *Cliente) daAPI(ctx context.Context, cpf string) (*Resposta, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/v1/criterios/%s", strings.TrimRight(c.baseURL, "/"), cpf), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return &Resposta{CPF: cpf, Encontrado: false, ConsultadoEm: time.Now()}, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("serviço de verificação devolveu %d", resp.StatusCode)
	}
	var r Resposta
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, err
	}
	r.CPF = cpf
	return &r, nil
}

func SoDigitos(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// CPFValido confere os dois dígitos verificadores e rejeita sequências repetidas.
func CPFValido(cpf string) bool {
	if len(cpf) != 11 {
		return false
	}
	n := make([]int, 11)
	iguais := true
	for i, r := range cpf {
		if r < '0' || r > '9' {
			return false
		}
		n[i] = int(r - '0')
		if n[i] != n[0] {
			iguais = false
		}
	}
	if iguais {
		return false
	}
	digito := func(ate, peso int) int {
		soma := 0
		for i := 0; i < ate; i++ {
			soma += n[i] * (peso - i)
		}
		if r := 11 - soma%11; r < 10 {
			return r
		}
		return 0
	}
	return digito(9, 10) == n[9] && digito(10, 11) == n[10]
}
