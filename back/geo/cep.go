package geo

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Local struct {
	Lat, Lon float64
	Endereco string
	Bairro   string
}

type CEP struct {
	BaseURL string
	http    *http.Client
}

func NovoCEP() *CEP {
	return &CEP{BaseURL: "https://brasilapi.com.br", http: &http.Client{Timeout: 8 * time.Second}}
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

// Buscar devolve (nil, nil) sempre que não dá para geocodificar — CEP curto, 404,
// rede fora ou resposta sem coordenadas. O fluxo então cai no clique no mapa, que
// é o caminho garantido; nenhuma dessas situações é erro para a família.
func (c *CEP) Buscar(ctx context.Context, cep string) (*Local, error) {
	d := soDigitos(cep)
	if len(d) != 8 {
		return nil, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/api/cep/v2/"+d, nil)
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

	var body struct {
		Street       string `json:"street"`
		Neighborhood string `json:"neighborhood"`
		City         string `json:"city"`
		Location     struct {
			Coordinates struct {
				Latitude  string `json:"latitude"`
				Longitude string `json:"longitude"`
			} `json:"coordinates"`
		} `json:"location"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, nil
	}
	lat, e1 := strconv.ParseFloat(body.Location.Coordinates.Latitude, 64)
	lon, e2 := strconv.ParseFloat(body.Location.Coordinates.Longitude, 64)
	if e1 != nil || e2 != nil {
		return nil, nil
	}

	partes := []string{}
	for _, p := range []string{body.Street, body.Neighborhood, body.City} {
		if p != "" {
			partes = append(partes, p)
		}
	}
	return &Local{Lat: lat, Lon: lon, Endereco: strings.Join(partes, ", "), Bairro: body.Neighborhood}, nil
}
