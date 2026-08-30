import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { AvisoDemo, Cabecalho, Erro, Icone, Passos } from '../componentes'
import { CHAVE_ESTADO, SeletorDemo, lerEstadoDemo } from '../demoEstado'

const mascaraCPF = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

export default function Entrar() {
  const navegar = useNavigate()
  const [modo, setModo] = useState('entrar')
  const [f, setF] = useState({ cpf: '', nome: '', nascimento: '', senha: '' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  // atalho de apresentação: em que fase do processo a família está. Quem lê e
  // decide a rota é o App; aqui a tela só grava a escolha.
  const [estadoDemo, setEstadoDemo] = useState(lerEstadoDemo)

  const mudar = (e) => {
    const { name, value } = e.target
    setF((atual) => ({ ...atual, [name]: name === 'cpf' ? mascaraCPF(value) : value }))
  }

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      try { localStorage.setItem(CHAVE_ESTADO, estadoDemo) } catch { /* sem storage: cai no fluxo normal */ }
      const r = await api(`/api/auth/${modo === 'entrar' ? 'entrar' : 'registrar'}`, f)
      localStorage.setItem('token', r.token)
      localStorage.setItem('nome', r.nome || '')
      navegar('/inscricao/dados')
    } catch (x) {
      setErro(x.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pagina entrada">
      {/* Painel da tese, só no desktop: o espaço horizontal carrega substância
          em vez de vazio. Todos os números vêm das bases de 2021-2025. */}
      <aside className="tese" aria-label="Sobre o Matrícula Carioca">
        <div className="tese-topo">
          <span className="brandmark"><Icone nome="casa" tamanho={16} /></span>
          <b>Matrícula Carioca</b>
        </div>

        <div className="tese-corpo">
          <h2>A fila da creche não é só falta de vaga.</h2>
          <p>
            A rede tem vagas ociosas e lista de espera ao mesmo tempo. O descompasso é
            territorial: a família escolhe cinco creches sem nenhuma informação de distância,
            a lista enche de opções inviáveis e a vaga fica presa.
          </p>

          <dl className="numeros">
            <div>
              <dt>Inscrições num único processo</dt>
              <dd>45 mil<span>em 872 unidades da rede</span></dd>
            </div>
            <div>
              <dt>Confirmam a matrícula na 1ª opção</dt>
              <dd>42,7%<span>no próprio bairro, contra 31,8% fora dele</span></dd>
            </div>
            <div>
              <dt>Opções usadas, das cinco possíveis</dt>
              <dd>2,4<span>a cauda da lista fica longe e morre</span></dd>
            </div>
          </dl>

          <p className="tese-nota">
            Aqui a distância entra na conta antes da escolha, e os critérios que a Prefeitura
            já conhece vêm preenchidos.
          </p>
        </div>

        <p className="tese-rodape">
          Protótipo do Claude Impact Lab Rio · dados públicos da SME de 2021 a 2025
        </p>
      </aside>

      <div className="app">
        <div className="rail">
          <Cabecalho />
          <Passos atual="conta" />
          <AvisoDemo />

          <div className="titulo">
            <h1>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
            <p className="lede">
              Com o seu CPF a Prefeitura já confirma vários critérios por você. Você responde só o que falta.
            </p>
          </div>

          <form onSubmit={enviar} className="form">
            <label className="field">
              <span>CPF</span>
              <input
                name="cpf" value={f.cpf} onChange={mudar} inputMode="numeric" autoComplete="username"
                placeholder="000.000.000-00" required
              />
            </label>

            {modo === 'criar' && (
              <>
                <label className="field">
                  <span>Nome do responsável</span>
                  <input name="nome" value={f.nome} onChange={mudar} autoComplete="name" required />
                </label>
                <label className="field">
                  <span>Data de nascimento do responsável</span>
                  <input name="nascimento" type="date" value={f.nascimento} onChange={mudar} required />
                </label>
              </>
            )}

            <label className="field">
              <span>Senha</span>
              <input
                name="senha" type="password" value={f.senha} onChange={mudar} required
                autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              />
            </label>

            <Erro>{erro}</Erro>

            <button className="cta" disabled={enviando}>
              {enviando ? 'Enviando…' : modo === 'entrar' ? 'Entrar' : 'Criar conta e continuar'}
              <Icone nome="seta" largura={2.4} />
            </button>
          </form>

          <button
            type="button" className="link"
            onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro('') }}
          >
            {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
          </button>

          <SeletorDemo valor={estadoDemo} aoMudar={setEstadoDemo} />

          <p className="rodape">
            Demonstração: 100.000.000-19 (Ana) · 100.000.001-08 (Bruno) · 100.000.002-80 (Carla).
            Crie a conta com qualquer senha.
          </p>
        </div>
      </div>
    </div>
  )
}
