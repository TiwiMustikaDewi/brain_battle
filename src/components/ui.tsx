import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-volt to-volt-2 text-ink shadow-lg shadow-volt/30 hover:shadow-volt/50',
  secondary: 'bg-gradient-to-r from-sky/25 to-sky/10 text-white border border-sky/40 hover:border-sky-2 hover:shadow-lg hover:shadow-sky/25',
  danger: 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-600/25',
  success: 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-600/25',
  ghost: 'text-muted hover:text-white hover:bg-sky/15',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5', lg: 'px-6 py-4 text-lg' }
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-95 disabled:opacity-40 ${VARIANTS[variant]} ${sizes[size]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl border border-sky/25 bg-panel/75 shadow-xl shadow-black/20 backdrop-blur-md ${className}`}>{children}</div>
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-line bg-ink/60 px-3.5 py-2.5 outline-none placeholder:text-muted/60 focus:border-volt focus:ring-2 focus:ring-volt/30 transition ${props.className ?? ''}`}
    />
  )
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-line bg-ink/60 px-3.5 py-2.5 outline-none placeholder:text-muted/60 focus:border-volt focus:ring-2 focus:ring-volt/30 transition ${props.className ?? ''}`}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">{children}</span>
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p role="alert" className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{children}</p>
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight ${className}`}>
      <span className="text-sky-2">Brain</span>
      <span className="inline-block animate-bob text-volt">⚡</span>
      <span className="text-gradient">Battle</span>
    </span>
  )
}

export function FullCenter({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>
}

export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-1.5 text-center text-sm font-semibold text-ink">
      Koneksi terputus — mencoba menyambung lagi…
    </div>
  )
}
