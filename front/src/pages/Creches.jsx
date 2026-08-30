import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Layer, Marker, NavigationControl, Source } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, MAP_STYLE } from '../api'
import { AvisoDemo, Cabecalho, Carregando, Chance, corDaFaixa, Erro, Icone, Medidor, Passos } from '../componentes'
import { deFaixa, km as fmtKm, ROTULO } from '../faixa'
import { nomeUnidade } from '../texto'

// as 872 unidades numa passada de WebGL; só as recomendadas viram Marker
const camadaTodas = {
  id: 'todas',
  type: 'circle',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 5],
    'circle-color': '#7C8CA1',
    'circle-opacity': 0.65,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#E9EDF2',
  },
}

const RAIOS = [3, 5, 10]

export default function Creches() {
  const navegar = useNavigate()
  const [dados, setDados] = useState(null)
  const [raio, setRaio] = useState(5)
  const [sel, setSel] = useState([])
  const [aberta, setAberta] = useState(0)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [view, setView] = useState(null)
  const [celular, setCelular] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const ouvir = (e) => setCelular(e.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [])

  useEffect(() => {
    let vivo = true
    setErro('')
    api(`/api/inscricao/recomendacoes?raio_km=${raio}`)
      .then((d) => {
        if (!vivo) return
        setDados(d)
        setAberta(0)
        setView((v) => v || { longitude: d.referencia.lon, latitude: d.referencia.lat, zoom: 13.5 })
      })
      .catch((x) => vivo && setErro(x.message))
    return () => { vivo = false }
  }, [raio])

  const recomendadas = useMemo(() => {
    if (!dados) return []
    const termo = busca.trim().toLowerCase()
    const lista = dados.recomendadas.map((r) => ({ ...r, nome: nomeUnidade(r.nome), faixa: deFaixa(r) }))
    return termo ? lista.filter((r) => r.nome.toLowerCase().includes(termo)) : lista
  }, [dados, busca])

  // O modelo nem sempre separa as cinco. Quando não separa, dizer isso é mais
  // útil (e mais honesto) do que repetir a mesma palavra cinco vezes em silêncio.
  const faixaUniforme =
    recomendadas.length > 1 && new Set(recomendadas.map((r) => r.faixa)).size === 1
      ? recomendadas[0].faixa
      : null

  const geojson = useMemo(() => {
    if (!dados) return null
    const marcadas = new Set(dados.recomendadas.map((r) => r.cod))
    return {
      type: 'FeatureCollection',
      features: (dados.todas || [])
        .filter((u) => !marcadas.has(u.cod))
        .map((u) => ({
          type: 'Feature',
          properties: { nome: u.nome, bairro: u.bairro },
          geometry: { type: 'Point', coordinates: [u.lon, u.lat] },
        })),
    }
  }, [dados])

  if (!dados || !view) {
    return (
      <div className="pagina"><div className="app"><div className="rail">
        <Cabecalho voltar="/inscricao/referencia" />
        <Passos atual="creches" />
        <AvisoDemo />
        {erro ? <Erro>{erro}</Erro> : <Carregando>Calculando as melhores opções…</Carregando>}
      </div></div></div>
    )
  }

  const alternar = (cod) =>
    setSel((atual) =>
      atual.includes(cod) ? atual.filter((c) => c !== cod) : atual.length < 5 ? [...atual, cod] : atual,
    )
  const ordinal = (cod) => {
    const i = sel.indexOf(cod)
    return i < 0 ? null : `${i + 1}ª opção`
  }

  async function concluir() {
    setErro('')
    setEnviando(true)
    try {
      await api('/api/inscricao/opcoes', { unidades: sel })
      navegar('/inscricao/concluida')
    } catch (x) {
      setErro(x.message)
    } finally {
      setEnviando(false)
    }
  }

  const escolhida = recomendadas[aberta] || recomendadas[0]
  const cartao = escolhida ? (
    <article className="popup">
      <div className="top">
        <span className="avatar"><Icone nome="predio" tamanho={21} largura={1.8} /></span>
        <div>
          <h3>{escolhida.nome}</h3>
          <p className="sub">{escolhida.bairro}</p>
        </div>
      </div>
      <dl className="stats">
        <div>
          <dt>Chance</dt>
          <dd className="comfaixa" style={{ color: corDaFaixa(escolhida.faixa) }}>
            <Medidor faixa={escolhida.faixa} />
            {ROTULO[escolhida.faixa]}
          </dd>
        </div>
        <div><dt>Distância</dt><dd>{fmtKm(escolhida.km)}</dd></div>
        <div><dt>Turno</dt><dd>{dados.horario}</dd></div>
      </dl>
      <p className="porque"><b>Por que aparece aqui:</b> {escolhida.motivo}</p>
      <button
        type="button"
        className={`acao${sel.includes(escolhida.cod) ? ' remover' : ''}`}
        onClick={() => alternar(escolhida.cod)}
      >
        {sel.includes(escolhida.cod) ? 'Remover das minhas opções' : 'Escolher esta creche'}
      </button>
    </article>
  ) : null

  return (
    <div className="pagina larga">
      <div className="app duas">
        <div className="rail">
          <Cabecalho
            voltar="/inscricao/referencia"
            info="A chance combina a distância da sua referência com o histórico de cada unidade."
          />
          <Passos atual="creches" />
          <AvisoDemo />

          <div className="titulo">
            <h1>Creches para {dados.grupamento} · {dados.horario}</h1>
            <p className="lede">
              Ordenadas pela chance de a matrícula dar certo. Escolha até 5, na ordem de preferência.
            </p>
          </div>

          <label className="search">
            <Icone nome="busca" tamanho={16} />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar creche pelo nome" aria-label="Buscar creche pelo nome"
            />
          </label>

          {celular && cartao}

          <div className="filters">
            <div className="fgroup">
              <span className="rotulo">Distância</span>
              <div className="opts">
                {RAIOS.map((r) => (
                  <button
                    key={r} type="button" className={`opt${raio === r ? ' on' : ''}`}
                    aria-pressed={raio === r} onClick={() => setRaio(r)}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>
          </div>

          {dados.raio_ampliado && (
            <p className="dica">
              <Icone nome="alerta" tamanho={13} />
              <span>
                Nenhuma creche de {dados.grupamento} {dados.horario.toLowerCase()} em {raio} km —
                ampliamos a busca para {raio * 2} km.
              </span>
            </p>
          )}

          {faixaUniforme && (
            <p className="aviso">
              <Icone nome="info" tamanho={14} />
              <span>
                As {recomendadas.length} opções têm chance <b>{ROTULO[faixaUniforme].toLowerCase()}</b> parecida entre si.
                Nesse caso, use a distância para decidir: quanto mais perto, maior a chance de você
                conseguir levar a criança todo dia.
              </span>
            </p>
          )}

          <ul className="list">
            {recomendadas.map((r, i) => {
              const ord = ordinal(r.cod)
              return (
                <li key={r.cod}>
                  <button
                    type="button"
                    className={`item${aberta === i ? ' sel' : ''}`}
                    aria-pressed={aberta === i}
                    onClick={() => setAberta(i)}
                  >
                    <span className={`rank ${r.faixa}`}>{i + 1}</span>
                    <span>
                      <span className="nome">{r.nome}</span>
                      <span className="meta">{r.bairro} · {fmtKm(r.km)}</span>
                      {ord && (
                        <span className="ordinal">
                          <Icone nome="check" tamanho={9} largura={3.5} />{ord}
                        </span>
                      )}
                    </span>
                    <Chance faixa={r.faixa} />
                  </button>
                </li>
              )
            })}
            {recomendadas.length === 0 && (
              <li className="vazio">Nenhuma creche com esse nome entre as recomendadas.</li>
            )}
          </ul>

          <p className="aviso">
            <Icone nome="info" tamanho={14} />
            <span>
              A faixa de chance é uma estimativa a partir dos processos de 2021 a 2025 e não garante
              vaga. A ordem de chamada segue os critérios da SME.
            </span>
          </p>

          <Erro>{erro}</Erro>

          <div className="confirm">
            <div className="count">
              <b>{sel.length} de 5 opções</b>
              escolhidas na ordem de preferência
            </div>
            <button className="cta" disabled={!sel.length || enviando} onClick={concluir}>
              {enviando ? 'Enviando…' : 'Confirmar inscrição'}
              <Icone nome="seta" largura={2.4} />
            </button>
          </div>
        </div>

        <div className="mapa">
          <Map
            {...view}
            onMove={(e) => setView(e.viewState)}
            mapStyle={MAP_STYLE}
            style={{ width: '100%', height: '100%' }}
            interactiveLayerIds={['todas']}
          >
            <NavigationControl position="top-right" showCompass={false} />
            {geojson && (
              <Source id="todas-src" type="geojson" data={geojson}>
                <Layer {...camadaTodas} />
              </Source>
            )}

            <Marker longitude={dados.referencia.lon} latitude={dados.referencia.lat} anchor="bottom">
              <span className="mk ref">
                <span className="pin"><Icone nome="casa" tamanho={15} largura={2} /></span>
                <span className="badge">Sua referência</span>
              </span>
            </Marker>

            {recomendadas.map((r, i) => (
              <Marker
                key={r.cod} longitude={r.lon} latitude={r.lat} anchor="bottom"
                onClick={(ev) => { ev.originalEvent.stopPropagation(); setAberta(i) }}
              >
                <span className={`mk${aberta === i ? ' on' : ''}`} role="button"
                      aria-label={`${r.nome}, chance ${ROTULO[r.faixa].toLowerCase()}`}>
                  <span className={`pin ${r.faixa}`}><span>{i + 1}</span></span>
                  <span className="badge">{ROTULO[r.faixa]}</span>
                </span>
              </Marker>
            ))}
          </Map>

          <div className="legend">
            <h4>Chance de a matrícula dar certo</h4>
            <ul>
              <li><i className="dot alta" /> Alta</li>
              <li><i className="dot media" /> Média</li>
              <li><i className="dot baixa" /> Baixa</li>
              <li><i className="dot outras" /> Demais unidades</li>
            </ul>
          </div>

          {!celular && cartao}
        </div>
      </div>
    </div>
  )
}
