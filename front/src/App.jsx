import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Entrar from './pages/Entrar'
import Dados from './pages/Dados'
import Referencia from './pages/Referencia'
import Creches from './pages/Creches'
import Concluida from './pages/Concluida'

const Privada = ({ children }) =>
  localStorage.getItem('token') ? children : <Navigate to="/entrar" replace />

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/inscricao/dados" element={<Privada><Dados /></Privada>} />
        <Route path="/inscricao/referencia" element={<Privada><Referencia /></Privada>} />
        <Route path="/inscricao/creches" element={<Privada><Creches /></Privada>} />
        <Route path="/inscricao/concluida" element={<Privada><Concluida /></Privada>} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
