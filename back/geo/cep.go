package geo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Precisao diz de onde veio a coordenada, para a tela nunca prometer mais
// exatidão do que existe.
type Precisao string

const (
	PrecisaoRua    Precisao = "rua"
	PrecisaoBairro Precisao = "bairro"
)

type Local struct {
	Lat, Lon float64
	Endereco string
	Bairro   string
	Precisao Precisao
}

// CEP resolve um CEP em ponto no mapa usando DUAS fontes, cada uma no que sabe
// fazer: a BrasilAPI transforma o CEP em logradouro/bairro, e o Nominatim
// transforma esse endereço em coordenada.
//
// A coordenada da própria BrasilAPI é ignorada de propósito: ela devolve o
// centroide do município para todo CEP do Rio (-22.90642,-43.18223 tanto para
// Senador Camará quanto para Botafogo). Usá-la faria a recomendação apontar
// creches do Centro para uma família da Zona Oeste, com uma distância em km
// escrita ao lado com toda a confiança.
type CEP struct {
	BaseURL      string
	NominatimURL string
	http         *http.Client
}

func NovoCEP() *CEP {
	return &CEP{
		BaseURL:      "https://brasilapi.com.br",
		NominatimURL: "https://nominatim.openstreetmap.org/search",
		http:         &http.Client{Timeout: 8 * time.Second},
	}
}

// caixa do município do Rio, com folga; ponto fora dela não serve para
// recomendar creche municipal e é melhor recusar do que responder errado.
const (
	latMin, latMax = -23.10, -22.73
	lonMin, lonMax = -43.81, -43.09
)

func noRio(lat, lon float64) bool {
	return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax
}

func soDigitos(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

type endereco struct {
	Street       string `json:"street"`
	Neighborhood string `json:"neighborhood"`
	City         string `json:"city"`
}

// Buscar devolve (nil, nil) sempre que não dá para localizar com confiança —
// CEP curto, 404, rede fora, ou endereço que o geocodificador não conhece. O
// fluxo então cai no clique no mapa, que é o caminho garantido. Nenhuma dessas
// situações é erro para a família, e nenhuma delas devolve um ponto chutado.
func (c *CEP) Buscar(ctx context.Context, cep string) (*Local, error) {
	d := soDigitos(cep)
	if len(d) != 8 {
		return nil, nil
	}
	end, err := c.endereco(ctx, d)
	if err != nil || end == nil || end.Neighborhood == "" {
		return nil, err
	}
	cidade := end.City
	if cidade == "" {
		cidade = "Rio de Janeiro"
	}

	// primeiro a rua; se o geocodificador não a conhece, cai para o bairro — e
	// aí o texto desce junto, para o par texto/coordenada nunca se contradizer.
	if end.Street != "" {
		alvo := end.Street + ", " + end.Neighborhood + ", " + cidade + ", RJ, Brasil"
		if lat, lon, ok := c.geocodificar(ctx, alvo); ok {
			return &Local{Lat: lat, Lon: lon, Bairro: end.Neighborhood, Precisao: PrecisaoRua,
				Endereco: end.Street + ", " + end.Neighborhood + ", " + cidade}, nil
		}
	}
	alvo := end.Neighborhood + ", " + cidade + ", RJ, Brasil"
	if lat, lon, ok := c.geocodificar(ctx, alvo); ok {
		return &Local{Lat: lat, Lon: lon, Bairro: end.Neighborhood, Precisao: PrecisaoBairro,
			Endereco: end.Neighborhood + ", " + cidade}, nil
	}
	return nil, nil
}

func (c *CEP) endereco(ctx context.Context, cep string) (*endereco, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/api/cep/v2/"+cep, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}
	var e endereco
	if err := json.NewDecoder(resp.Body).Decode(&e); err != nil {
		return nil, nil
	}
	return &e, nil
}

// geocodificar chama o Nominatim (OpenStreetMap). O User-Agent é exigido pela
// política de uso deles; sem ele a resposta vem 403.
func (c *CEP) geocodificar(ctx context.Context, alvo string) (lat, lon float64, ok bool) {
	u := c.NominatimURL + "?format=json&limit=1&countrycodes=br&q=" + url.QueryEscape(alvo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return 0, 0, false
	}
	req.Header.Set("User-Agent", "matricula-carioca/1.0 (impact-lab-34; hackathon SME-Rio)")
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, 0, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, false
	}
	var achados []struct {
		Lat string `json:"lat"`
		Lon string `json:"lon"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&achados); err != nil || len(achados) == 0 {
		return 0, 0, false
	}
	lat, e1 := strconv.ParseFloat(achados[0].Lat, 64)
	lon, e2 := strconv.ParseFloat(achados[0].Lon, 64)
	if e1 != nil || e2 != nil || !noRio(lat, lon) {
		return 0, 0, false
	}
	return lat, lon, true
}
