import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, CENTRO_RIO, MAP_STYLE } from '../api'
import { AvisoDemo, Cabecalho, Erro, Icone, Passos } from '../componentes'

export default function Referencia() {
  const navegar = useNavigate()
  const [cep, setCep] = useState('')
  // ponto.precisao: 'exata' (marcado no mapa) · 'rua' (logradouro do CEP) · 'bairro' (só o bairro).
  // A tela não pode parecer igualmente precisa nos três casos: um ponto de bairro pode
  // estar a quilômetros da casa e faria a recomendação errar com cara de certeza.
  const [ponto, setPonto] = useState(null)
  const [erro, setErro] = useState('')
  const [dica, setDica] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [view, setView] = useState(CENTRO_RIO)

  // pré-preenche com o endereço do cadastro, quando existe
  useEffect(() => {
    api('/api/inscricao/preparar')
      .then((d) => {
        const e = d.contato?.endereco
        if (e?.latitude != null) {
          setPonto({
            lat: e.latitude,
            lon: e.longitude,
            texto: `${e.logradouro}${e.numero ? `, ${e.numero}` : ''} — ${e.bairro} (endereço do seu cadastro)`,
            precisao: 'rua',
          })
          setView((v) => ({ ...v, latitude: e.latitude, longitude: e.longitude, zoom: 14 }))
          if (e.cep) setCep(e.cep)
        } else {
          setDica('Não temos endereço no seu cadastro. Informe o CEP ou toque no mapa.')
        }
      })
      .catch(() => {})
  }, [])

  async function buscarCep() {
    setErro('')
    setDica('')
    setBuscando(true)
    try {
      const r = await api('/api/inscricao/referencia', { cep })
      // o texto vem pronto da API; não acrescente rua nenhuma por conta própria
      setPonto({ lat: r.lat, lon: r.lon, texto: r.texto, precisao: r.precisao || 'rua' })
      // ponto de bairro não merece zoom de rua: o enquadramento também comunica precisão
      setView((v) => ({ ...v, latitude: r.lat, longitude: r.lon, zoom: r.precisao === 'bairro' ? 13.5 : 15 }))
    } catch (x) {
      // 422 é caminho normal: nem todo CEP tem coordenada
      if (x.status === 422) setDica(x.message)
      else setErro(x.message)
    } finally {
      setBuscando(false)
    }
  }

  // marcar ou arrastar o pino é sempre a informação mais precisa que existe
  function marcar(lat, lon) {
    setDica('')
    setPonto({ lat, lon, texto: 'Ponto marcado no mapa', precisao: 'exata' })
  }

  async function continuar() {
    setErro('')
    try {
      await api('/api/inscricao/referencia', { lat: ponto.lat, lon: ponto.lon, texto: ponto.texto })
      navegar('/inscricao/creches')
    } catch (x) {
      setErro(x.message)
    }
  }

  return (
    <div className="pagina">
      <div className="app"><div className="rail">
        <Cabecalho voltar="/inscricao/dados" />
        <Passos atual="local" />
        <AvisoDemo />

        <div className="titulo">
          <h1>De onde você vai levar a criança?</h1>
          <p className="lede">
            Pode ser sua casa, o trabalho ou a casa de quem cuida. A distância é o que mais pesa
            na chance de a matrícula dar certo.
          </p>
        </div>

        <div className="linha">
          <label className="field crescer">
            <span>CEP</span>
            <input
              value={cep} onChange={(e) => setCep(e.target.value)}
              inputMode="numeric" placeholder="00000-000" autoComplete="postal-code"
            />
          </label>
          <button type="button" className="pill forte" onClick={buscarCep} disabled={buscando || !cep}>
            {buscando ? 'Buscando…' : 'Buscar CEP'}
          </button>
        </div>

        {dica && (
          <p className="dica">
            <Icone nome="pin" tamanho={13} />
            <span>{dica}</span>
          </p>
        )}
        <p className="ajuda">Ou toque no mapa para marcar o ponto exato.</p>

        <div className="mapa alto">
          <Map
            {...view}
            onMove={(e) => setView(e.viewState)}
            mapStyle={MAP_STYLE}
            style={{ width: '100%', height: '100%' }}
            onClick={(e) => marcar(e.lngLat.lat, e.lngLat.lng)}
          >
            <NavigationControl position="top-right" showCompass={false} />
            {ponto && (
              <Marker
                longitude={ponto.lon} latitude={ponto.lat} anchor="bottom"
                draggable onDragEnd={(e) => marcar(e.lngLat.lat, e.lngLat.lng)}
              >
                <span className="mk ref arrastavel" title="Arraste para ajustar">
                  <span className="pin"><Icone nome="casa" tamanho={15} largura={2} /></span>
                </span>
              </Marker>
            )}
          </Map>
        </div>

        {ponto?.precisao === 'bairro' && (
          <p className="dica">
            <Icone nome="pin" tamanho={13} />
            <span>
              Localizamos <b>{ponto.texto}</b> pelo bairro, não pela rua. Arraste o pino até a sua
              casa — assim as creches recomendadas ficam realmente perto de você.
            </span>
          </p>
        )}
        {ponto?.precisao === 'rua' && (
          <p className="ok">
            <Icone nome="check" tamanho={13} largura={3} />
            <span>Referência: {ponto.texto}. Arraste o pino se quiser ajustar.</span>
          </p>
        )}
        {ponto?.precisao === 'exata' && (
          <p className="ok">
            <Icone nome="check" tamanho={13} largura={3} />
            <span>Referência marcada no mapa.</span>
          </p>
        )}
        <Erro>{erro}</Erro>

        <div className="confirm">
          <div className="count">
            <b>{ponto ? 'Local definido' : 'Falta o local'}</b>
            {ponto ? 'você pode ajustar tocando no mapa' : 'informe o CEP ou toque no mapa'}
          </div>
          <button className="cta" disabled={!ponto} onClick={continuar}>
            Ver creches perto daqui
            <Icone nome="seta" largura={2.4} />
          </button>
        </div>
      </div></div>
    </div>
  )
}
