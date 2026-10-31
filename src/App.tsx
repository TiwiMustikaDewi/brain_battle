import { Route, Routes, useLocation } from 'react-router'
import { FullCenter, Logo } from './components/ui'
import { isConfigured } from './lib/supabase'
import AdminHome from './pages/admin/AdminHome'
import AdminQuestions from './pages/admin/AdminQuestions'
import AdminSession from './pages/admin/AdminSession'
import Home from './pages/Home'
import Join from './pages/Join'
import Play from './pages/Play'
import Screen from './pages/Screen'

export default function App() {
  return (
    <>
      <Backdrop />
      <Pages />
    </>
  )
}

function Backdrop() {
  return (
    <div className="bb-bg" aria-hidden>
      <span className="bb-blob b1" />
      <span className="bb-blob b2" />
      <span className="bb-blob b3" />
      <span className="bb-glow" />
    </div>
  )
}

function Pages() {
  const { pathname } = useLocation()
  if (!isConfigured) {
    return (
      <FullCenter>
        <Logo className="text-4xl" />
        <p className="max-w-md text-muted">
          Supabase belum dikonfigurasi. Salin <code className="text-volt">.env.example</code> menjadi{' '}
          <code className="text-volt">.env.local</code> lalu isi <code>VITE_SUPABASE_URL</code> dan{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </FullCenter>
    )
  }
  return (
    <div key={pathname} className="animate-enter">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play/:code" element={<Join />} />
        <Route path="/play/:code/game" element={<Play />} />
        <Route path="/screen/:code" element={<Screen />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/questions" element={<AdminQuestions />} />
        <Route path="/admin/s/:code" element={<AdminSession />} />
        <Route path="*" element={<FullCenter><Logo className="text-3xl" /><p className="text-muted">Halaman tidak ditemukan.</p></FullCenter>} />
      </Routes>
    </div>
  )
}
