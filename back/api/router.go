package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/antoniomesquita09/impact-lab-34/back/geo"
	"github.com/antoniomesquita09/impact-lab-34/back/modelo"
	"github.com/antoniomesquita09/impact-lab-34/back/notifica"
	"github.com/antoniomesquita09/impact-lab-34/back/verificacao"
	"github.com/jackc/pgx/v5/pgxpool"
)

type App struct {
	Pool        *pgxpool.Pool
	Ref         *modelo.Ref
	Verificacao *verificacao.Cliente
	CEP         *geo.CEP
	Roteador    *geo.Roteador
	Email       *notifica.Enviador
	AnoLetivo   int
}

func escreverJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// erro sempre devolve uma frase que a família consegue ler — nada de detalhe técnico.
func erro(w http.ResponseWriter, status int, msg string) {
	escreverJSON(w, status, map[string]string{"erro": msg})
}

func lerJSON(r *http.Request, v any) error { return json.NewDecoder(r.Body).Decode(v) }

func (a *App) Rotas() http.Handler {
	mux := http.NewServeMux()
	// healthCheckPath do Render: responde sem tocar no banco, de propósito.
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("POST /api/auth/registrar", a.registrar)
	mux.HandleFunc("POST /api/auth/entrar", a.entrar)
	mux.HandleFunc("GET /api/eu", a.autenticado(a.eu))
	mux.HandleFunc("GET /api/inscricao/preparar", a.autenticado(a.preparar))
	mux.HandleFunc("POST /api/inscricao/respostas", a.autenticado(a.respostas))
	mux.HandleFunc("POST /api/inscricao/referencia", a.autenticado(a.referencia))
	mux.HandleFunc("GET /api/inscricao/recomendacoes", a.autenticado(a.recomendacoes))
	mux.HandleFunc("POST /api/inscricao/opcoes", a.autenticado(a.opcoes))
	mux.HandleFunc("GET /api/inscricao/comprovante", a.autenticado(a.comprovante))
	mux.HandleFunc("GET /api/inscricao/rota", a.autenticado(a.rota))
	mux.HandleFunc("GET /api/inscricao", a.autenticado(a.estado))

	dist := "front/dist"
	if _, err := os.Stat(dist); err == nil {
		fs := http.FileServer(http.Dir(dist))
		mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				erro(w, 404, "Rota não encontrada.")
				return
			}
			caminho := filepath.Join(dist, filepath.Clean("/"+r.URL.Path))
			if info, err := os.Stat(caminho); err != nil || info.IsDir() {
				// rota do React: devolve o index e deixa o roteador do front resolver
				http.ServeFile(w, r, filepath.Join(dist, "index.html"))
				return
			}
			fs.ServeHTTP(w, r)
		}))
	}
	return mux
}
