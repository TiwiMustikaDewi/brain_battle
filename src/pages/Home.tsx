import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, Card, Input, Logo } from '../components/ui'

export default function Home() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-10">
      <div className="text-center">
        <Logo className="text-5xl" />
        <p className="mt-3 text-muted">AFL Winter Peak 2026 · Capacity Building 3</p>
      </div>
      <Card className="p-5">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) navigate(`/play/${code.trim().toUpperCase()}`)
          }}
        >
          <label htmlFor="code" className="text-sm font-semibold text-muted">Kode sesi</label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="cth. SESI1"
            autoCapitalize="characters"
            autoComplete="off"
            className="text-center font-display text-2xl tracking-widest"
          />
          <Button type="submit" size="lg" disabled={!code.trim()}>Masuk</Button>
        </form>
      </Card>
      <p className="text-center text-sm text-muted">
        Panitia? <Link to="/admin" className="text-white underline underline-offset-4">Masuk admin</Link>
      </p>
    </main>
  )
}
