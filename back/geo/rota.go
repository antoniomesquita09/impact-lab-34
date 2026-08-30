package geo

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"time"
)

// Rota é o caminho de fato percorrido entre dois pontos. Km é a distância pela
// via, não em linha reta, e Geometria é o traçado para desenhar no mapa.
type Rota struct {
	Km        float64     `json:"km"`
	Minutos   int         `json:"minutos"`
	Geometria *LineString `json:"geometria"`
	Modo      string      `json:"modo"`
}

type LineString struct {
	Type        string       `json:"type"`
	Coordinates [][2]float64 `json:"coordinates"`
}

// Roteador consulta o OSRM. É opcional por construção: quando não responde, a
// aplicação continua com a distância em linha reta, que é o que o modelo usa.
type Roteador struct {
	BaseURL string
	http    *http.Client
}

func NovoRoteador() *Roteador {
	return &Roteador{
		BaseURL: "https://router.project-osrm.org",
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

func f8(v float64) string { return strconv.FormatFloat(v, 'f', 8, 64) }

// Rotear devolve (nil, nil) quando o serviço não responde ou não acha caminho.
// Nunca inventa traçado: sem rota, quem chama mostra a linha reta e diz que é.
// O servidor público do OSRM só serve o perfil de carro: pedir "foot" devolve
// a mesma rota, e rotular isso como caminhada seria mentir para a família. Até
// termos um servidor com o perfil de pedestre, só existe um modo.
func (r *Roteador) Rotear(ctx context.Context, deLat, deLon, paraLat, paraLon float64, modo string) (*Rota, error) {
	modo = "driving"
	u := r.BaseURL + "/route/v1/" + modo + "/" +
		f8(deLon) + "," + f8(deLat) + ";" + f8(paraLon) + "," + f8(paraLat) +
		"?overview=simplified&geometries=geojson"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "matricula-carioca/1.0 (impact-lab-34; hackathon SME-Rio)")
	resp, err := r.http.Do(req)
	if err != nil {
		return nil, nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}
	var body struct {
		Code   string `json:"code"`
		Routes []struct {
			Distance float64 `json:"distance"`
			Duration float64 `json:"duration"`
			Geometry struct {
				Coordinates [][2]float64 `json:"coordinates"`
			} `json:"geometry"`
		} `json:"routes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, nil
	}
	if body.Code != "Ok" || len(body.Routes) == 0 {
		return nil, nil
	}
	rt := body.Routes[0]
	out := &Rota{
		Km:      math.Round(rt.Distance/10) / 100,
		Minutos: int(math.Round(rt.Duration / 60)),
		Modo:    modo,
	}
	if len(rt.Geometry.Coordinates) > 0 {
		out.Geometria = &LineString{Type: "LineString", Coordinates: rt.Geometry.Coordinates}
	}
	return out, nil
}
