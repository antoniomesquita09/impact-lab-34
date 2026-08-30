import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Layer, Marker, NavigationControl, Popup, Source } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, MAP_STYLE } from '../api'
import { AvisoDemo, Cabecalho, Carregando, Chance, Erro, Faixa, Icone, Passos } from '../componentes'
import { deFaixa, km as fmtKm, ROTULO } from '../faixa'
import { nomeUnidade } from '../texto'
import { distanciaKm, normalizar } from '../geo'
import MinhasOpcoes from '../MinhasOpcoes'
import EditarRespostas from '../EditarRespostas'

// as 852 unidades numa passada de WebGL; só as recomendadas viram Marker.
// São três camadas sobre a mesma fonte: o desenho, o realce (escolhida ou sob o
// mouse) e um alvo transparente bem maior — 3 px é impossível de acertar no
// toque e ruim no mouse, então a área de clique cresce sem o desenho crescer.
const camadaTodas = {
  id: 'todas',
  type: 'circle',
  paint: {
    // no zoom inicial, 2px em cinza claro sobre basemap claro simplesmente somem:
    // a rede inteira estava no mapa e parecia não estar
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 13, 4.5, 16, 6.5],
    'circle-color': '#5A6B80',
    'circle-opacity': 0.85,
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#FFFFFF',
  },
}

const camadaDestaque = {
  id: 'todas-destaque',
  type: 'circle',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 13, 8, 16, 10],
    'circle-color': '#12626A',
    'circle-opacity': 0.18,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#12626A',
  },
}

const camadaAlvo = {
  id: 'todas-alvo',
  type: 'circle',
  paint: { 'circle-radius': 14, 'circle-opacity': 0, 'circle-stroke-width': 0 },
}

const RAIOS = [3, 5, 10]

export default function Creches() {
  const navegar = useNavigate()
  const [dados, setDados] = useState(null)
  const [raio, setRaio] = useState(5)
  const [sel, setSel] = useState([])
  const [codAberto, setCodAberto] = useState(null)
  const [busca, setBusca] = useState('')
  // 852 unidades de uma vez travam a rolagem; cresce sob demanda
  const [limite, setLimite] = useState(40)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [view, setView] = useState(null)
  const mapaRef = useRef(null)
  const [sobre, setSobre] = useState(null) // unidade sob o cursor, para realce e rótulo
  const [editando, setEditando] = useState(false)
  const [rota, setRota] = useState(null)
  const [buscandoRota, setBuscandoRota] = useState(false)
  const cacheRotas = useRef({})
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
        setCodAberto(d.recomendadas?.[0]?.cod ?? null)
        setView((v) => v || { longitude: d.referencia.lon, latitude: d.referencia.lat, zoom: 13.5 })
      })
      .catch((x) => vivo && setErro(x.message))
    return () => { vivo = false }
  }, [raio])

  const recomendadas = useMemo(
    () => (dados ? dados.recomendadas.map((r) => ({ ...r, nome: nomeUnidade(r.nome), faixa: deFaixa(r), recomendada: true })) : []),
    [dados],
  )

  // O resto da rede, por distância da referência. Estas unidades NÃO passaram
  // pelo modelo com posição, então não recebem faixa de chance — inventar uma
  // seria mostrar número que não existe. Nome, bairro e distância bastam.
  const outras = useMemo(() => {
    if (!dados) return []
    const rec = new Set(dados.recomendadas.map((r) => r.cod))
    const { lat, lon } = dados.referencia
    return (dados.todas || [])
      .filter((u) => !rec.has(u.cod))
      .map((u) => ({
        ...u,
        nome: nomeUnidade(u.nome),
        // `km` vem do servidor (PostGIS); o haversine fica só como rede de
        // segurança se o campo faltar, para a tela não ficar sem distância
        km: typeof u.km === 'number' ? u.km : distanciaKm(lat, lon, u.lat, u.lon),
        recomendada: false,
        // Só há chance quando a unidade oferece o grupamento e o turno da
        // criança. O servidor calcula p_pct mesmo para quem não oferece, e
        // mostrar "65%" para uma turma que não existe ali seria a pior mentira
        // possível: número alto e bonito para uma vaga inexistente.
        faixa: u.oferta && u.p_pct != null ? deFaixa(u) : null,
        semChance: !u.oferta ? 'nao_oferta' : u.p_pct == null ? 'sem_historico' : null,
      }))
      .sort((a, b) => a.km - b.km)
  }, [dados])

  // Busca vale para nome e bairro. Com texto no campo a divisão some: vira uma
  // listagem única de resultados, sem top 5 e sem seções.
  const termo = normalizar(busca)
  useEffect(() => { setLimite(40) }, [termo, raio])
  const resultados = useMemo(() => {
    if (!termo) return []
    const casa = (u) => normalizar(u.nome).includes(termo) || normalizar(u.bairro).includes(termo)
    return [...recomendadas, ...outras].filter(casa).sort((a, b) => a.km - b.km)
  }, [termo, recomendadas, outras])

  // O modelo nem sempre separa as cinco. Quando não separa, dizer isso é mais
  // útil (e mais honesto) do que repetir a mesma palavra cinco vezes em silêncio.
  const faixaUniforme =
    !termo && recomendadas.length > 1 && new Set(recomendadas.map((r) => r.faixa)).size === 1
      ? recomendadas[0].faixa
      : null

  // Todas as unidades por código, para o cartão e a sidebar acharem qualquer uma.
  // Objeto simples de propósito: `Map` aqui é o componente do react-map-gl, que
  // sombreia o Map nativo neste arquivo.
  const porCod = useMemo(() => {
    const m = {}
    for (const u of [...recomendadas, ...outras]) m[u.cod] = u
    return m
  }, [recomendadas, outras])

  // Abrir/fechar a sidebar muda a largura do mapa. O MapLibre observa o
  // contêiner, mas a transição da coluna termina depois do reflow — sem este
  // resize o canvas fica com o tamanho antigo e os pinos caem fora do basemap.
  const nSel = sel.length
  useEffect(() => {
    const t = setTimeout(() => mapaRef.current?.resize(), 320)
    return () => clearTimeout(t)
  }, [nSel])

  // Rota da referência até a creche selecionada, sob demanda no clique.
  // Vem do OSRM pelo back; pode voltar `rota: null` (serviço fora, sem
  // caminho), e nesse caso desenhamos a linha reta tracejada e dizemos que é
  // reta — sem inventar traçado.
  useEffect(() => {
    if (!codAberto) { setRota(null); setBuscandoRota(false); return }

    // já calculada nesta sessão: instantânea na segunda vez
    const guardada = cacheRotas.current[codAberto]
    if (guardada) { setRota(guardada); setBuscandoRota(false); return }

    let vivo = true
    setRota(null)
    setBuscandoRota(true)
    api(`/api/inscricao/rota?cod=${encodeURIComponent(codAberto)}`)
      .then((r) => {
        cacheRotas.current[codAberto] = r
        // `vivo` descarta a resposta se a pessoa já clicou em outra creche —
        // senão a rota de uma apareceria desenhada para outra
        if (vivo) setRota(r)
      })
      .catch(() => vivo && setRota(null))
      .finally(() => vivo && setBuscandoRota(false))
    return () => { vivo = false }
  }, [codAberto])

  const geoRota = useMemo(() => {
    if (!rota?.de || !rota?.para) return null
    const linha = rota.rota?.geometria
    return {
      real: !!linha,
      dados: {
        type: 'Feature',
        geometry: linha || {
          type: 'LineString',
          coordinates: [[rota.de.lon, rota.de.lat], [rota.para.lon, rota.para.lat]],
        },
      },
    }
  }, [rota])

  const geojson = useMemo(() => {
    if (!dados) return null
    const marcadas = new Set(dados.recomendadas.map((r) => r.cod))
    return {
      type: 'FeatureCollection',
      features: (dados.todas || [])
        .filter((u) => !marcadas.has(u.cod))
        .map((u) => ({
          type: 'Feature',
          properties: { cod: u.cod, nome: u.nome, bairro: u.bairro },
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

  const turno = `${dados.grupamento} ${dados.horario.toLowerCase()}`
  const rotuloSemChance = (u) =>
    u.semChance === 'nao_oferta' ? 'não oferece' : u.semChance === 'sem_historico' ? 'sem histórico' : undefined

  const alternar = (cod) =>
    setSel((atual) =>
      atual.includes(cod) ? atual.filter((c) => c !== cod) : atual.length < 5 ? [...atual, cod] : atual,
    )
  const ordinal = (cod) => {
    const i = sel.indexOf(cod)
    return i < 0 ? null : `${i + 1}ª opção`
  }

  // reordenar a lista de preferência: tira da origem e insere no destino
  const mover = (de, para) =>
    setSel((atual) => {
      if (para < 0 || para >= atual.length) return atual
      const nova = [...atual]
      const [item] = nova.splice(de, 1)
      nova.splice(para, 0, item)
      return nova
    })
  const remover = (cod) => setSel((atual) => atual.filter((c) => c !== cod))

  // os dados completos das escolhidas, na ordem que a família definiu
  const escolhidas = sel.map((cod) => porCod[cod]).filter(Boolean)

  // A chance na posição escolhida, como NÚMERO. A faixa da creche não muda com
  // a ordem — ela é a mesma da lista da esquerda; o que a ordem muda é este
  // percentual, que aparece ao lado dela sem contradizê-la.
  // Sem faixa não há percentual: se a unidade não oferece o turno ou não tem
  // histórico, mostrar "39% nesta posição" seria a mesma mentira pela porta dos
  // fundos — número de chance para uma turma que não existe ali.
  const pctNaPosicao = dados.recomendadas.some((r) => Array.isArray(r.p_por_posicao))
    ? (c, i) => (c.faixa == null ? null : c.p_por_posicao?.[Math.min(i, 4)] ?? null)
    : null

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

  // Com a sidebar aberta o mapa fica estreito demais para carregar o cartão por
  // cima sem esconder os pinos. Nesse caso o cartão desce para o trilho, como
  // já acontece no celular — o mapa continua sendo o herói da tela.
  const cartaoNoTrilho = celular || escolhidas.length > 0
  const escolhida = porCod[codAberto] || recomendadas[0]
  const cartao = escolhida ? (
    <article className={`popup${cartaoNoTrilho ? ' no-trilho' : ''}`}>
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
          <dd className="comfaixa"><Faixa faixa={escolhida.faixa} motivo={rotuloSemChance(escolhida)} /></dd>
        </div>
        <div><dt>Distância</dt><dd>{fmtKm(escolhida.km)}</dd></div>
        <div><dt>Turno</dt><dd>{dados.horario}</dd></div>
      </dl>
      {buscandoRota && (
        <p className="via buscando">
          <span className="spin pequeno" aria-hidden="true" />
          Calculando o caminho pela rua…
        </p>
      )}
      {!buscandoRota && rota?.cod === escolhida.cod && (
        <p className="via">
          {rota.rota
            ? <><b>{rota.rota.km.toFixed(1).replace('.', ',')} km</b> pela via · {rota.rota.minutos} min de carro</>
            : <>Não conseguimos traçar o caminho agora — a linha no mapa é reta, não o trajeto.</>}
        </p>
      )}
      {escolhida.recomendada ? (
        <p className="porque"><b>Por que aparece aqui:</b> {escolhida.motivo}</p>
      ) : escolhida.semChance === 'nao_oferta' ? (
        <p className="porque">
          Esta unidade <b>não oferece {turno}</b> — por isso não estimamos chance para ela.
          Você ainda pode escolhê-la, mas a turma da sua criança não existe ali hoje.
        </p>
      ) : escolhida.semChance === 'sem_historico' ? (
        <p className="porque">
          Esta unidade <b>não tem histórico suficiente</b> nos processos de 2021 a 2025, então não
          dá para estimar a chance. Você pode escolhê-la do mesmo jeito.
        </p>
      ) : (
        <p className="porque">
          Estimativa calculada com a mesma régua das recomendadas. Ela não está entre as cinco só
          porque outras ficaram à frente.
        </p>
      )}
      <button
        type="button"
        className={`acao${sel.includes(escolhida.cod) ? ' remover' : ''}`}
        onClick={() => alternar(escolhida.cod)}
      >
        {sel.includes(escolhida.cod) ? 'Remover das minhas opções' : 'Escolher esta creche'}
      </button>
    </article>
  ) : null

  // um item serve as duas listas: com posição e faixa nas recomendadas,
  // só nome, bairro e distância nas demais
  const Item = ({ u, posicao }) => {
    const ord = ordinal(u.cod)
    const ativo = codAberto === u.cod
    return (
      <li>
        <button
          type="button"
          className={`item${ativo ? ' sel' : ''}`}
          aria-pressed={ativo}
          onClick={() => setCodAberto(u.cod)}
        >
          {/* mesmo slot nos dois casos: número nas recomendadas, marca neutra nas demais */}
          {posicao ? (
            <span className={`rank ${u.faixa}`}>{posicao}</span>
          ) : (
            <span className="rank neutro" aria-hidden="true"><i /></span>
          )}
          <span>
            <span className="nome">{u.nome}</span>
            <span className="meta">{u.bairro || 'Rio de Janeiro'} · {fmtKm(u.km)}</span>
            {ord && (
              <span className="ordinal">
                <Icone nome="check" tamanho={9} largura={3.5} />{ord}
              </span>
            )}
          </span>
          <Chance faixa={u.faixa} motivo={rotuloSemChance(u)} />
        </button>
      </li>
    )
  }

  return (
    <div className="pagina larga">
      <div className={`app duas${escolhidas.length ? ' tres' : ''}`}>
        <div className="rail">
          <Cabecalho
            voltar="/inscricao/referencia"
          />
          <Passos atual="creches" />
          <AvisoDemo />

          <div className="titulo">
            <h1>Creches para {dados.grupamento} · {dados.horario}</h1>
            <p className="lede">
              Ordenadas pela chance de a matrícula dar certo. Escolha até 5, na ordem de preferência.
            </p>
          </div>

          <button type="button" className="editar-respostas" onClick={() => setEditando(true)}>
            <Icone nome="info" tamanho={13} />
            Editar minhas respostas
          </button>

          <label className="search">
            <Icone nome="busca" tamanho={16} />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar creche pelo nome" aria-label="Buscar creche pelo nome"
            />
          </label>

          {cartaoNoTrilho && cartao}

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

          {termo ? (
            <ul className="list">
              <li className="secao">
                {resultados.length === 0
                  ? 'Nenhuma creche encontrada'
                  : `${resultados.length} creche${resultados.length > 1 ? 's' : ''} para "${busca.trim()}"`}
              </li>
              {resultados.slice(0, limite).map((u) => <Item key={u.cod} u={u} />)}
              {resultados.length > limite && (
                <li>
                  <button type="button" className="mais" onClick={() => setLimite((n) => n + 40)}>
                    Mostrar mais {Math.min(40, resultados.length - limite)} de {resultados.length - limite}
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <>
              {/* sem recomendação não há seção: um cabeçalho "Recomendadas para
                  você" sobre uma lista vazia promete o que não entrega */}
              {recomendadas.length > 0 && (
                <ul className="list recomendadas">
                  <li className="secao destaque">
                    <Icone nome="check" tamanho={12} largura={3.5} />
                    Recomendadas para você
                  </li>
                  {recomendadas.map((r, i) => <Item key={r.cod} u={r} posicao={i + 1} />)}
                </ul>
              )}

              <ul className="list">
                <li className="secao">
                  Todas as creches de {dados.grupamento} {dados.horario.toLowerCase()}, da mais perto para a mais longe
                </li>
                {outras.slice(0, limite).map((u) => <Item key={u.cod} u={u} />)}
                {outras.length > limite && (
                  <li>
                    <button type="button" className="mais" onClick={() => setLimite((n) => n + 40)}>
                      Mostrar mais {Math.min(40, outras.length - limite)} de {outras.length - limite} restantes
                    </button>
                  </li>
                )}
              </ul>
            </>
          )}

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
            ref={mapaRef}
            {...view}
            onMove={(e) => setView(e.viewState)}
            mapStyle={MAP_STYLE}
            style={{ width: '100%', height: '100%' }}
            interactiveLayerIds={['todas-alvo']}
            cursor={sobre ? 'pointer' : 'grab'}
            onMouseMove={(e) => {
              const f = e.features?.[0]
              setSobre(f ? { ...f.properties, lat: e.lngLat.lat, lon: e.lngLat.lng } : null)
            }}
            onMouseLeave={() => setSobre(null)}
            onClick={(e) => {
              const f = e.features?.[0]
              if (f?.properties?.cod) setCodAberto(f.properties.cod)
            }}
          >
            <NavigationControl position="top-right" showCompass={false} />
            {geojson && (
              <Source id="todas-src" type="geojson" data={geojson}>
                <Layer {...camadaTodas} />
                <Layer
                  {...camadaDestaque}
                  filter={['in', ['get', 'cod'], ['literal', [...sel, sobre?.cod, codAberto].filter(Boolean)]]}
                />
                <Layer {...camadaAlvo} />
              </Source>
            )}

            {geoRota && (
              <Source id="rota-src" type="geojson" data={geoRota.dados}>
                <Layer id="rota-base" type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.9 }} />
                <Layer id="rota-linha" type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{
                    'line-color': '#12626A',
                    'line-width': 4,
                    ...(geoRota.real ? {} : { 'line-dasharray': [1.6, 1.4], 'line-opacity': 0.75 }),
                  }} />
              </Source>
            )}

            {sobre && (
              <Popup
                longitude={sobre.lon} latitude={sobre.lat} anchor="bottom" offset={14}
                closeButton={false} closeOnClick={false} className="rotulo-mapa"
              >
                <b>{nomeUnidade(sobre.nome)}</b>
                {sobre.bairro && <span>{sobre.bairro}</span>}
              </Popup>
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
                onClick={(ev) => { ev.originalEvent.stopPropagation(); setCodAberto(r.cod) }}
              >
                <span className={`mk${codAberto === r.cod ? ' on' : ''}`} role="button"
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

          {!cartaoNoTrilho && cartao}
        </div>

        <EditarRespostas aberto={editando} aoFechar={() => setEditando(false)} />

        <MinhasOpcoes
          itens={escolhidas}
          aoMover={mover}
          aoRemover={remover}
          pctNaPosicao={pctNaPosicao}
          motivoSemChance={rotuloSemChance}
        />
      </div>
    </div>
  )
}
