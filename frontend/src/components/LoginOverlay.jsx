import { useState } from 'react'

export default function LoginOverlay({ onLogin }) {
  const [user, setUser]   = useState('')
  const [pass, setPass]   = useState('')
  const [err,  setErr]    = useState('')
  const [busy, setBusy]   = useState(false)

  const submit = async () => {
    if (!user || !pass) return
    setBusy(true); setErr('')
    try {
      await onLogin(user.trim().toLowerCase(), pass)
    } catch (e) {
      setErr(e.message || 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] font-sans"
      style={{ background: 'linear-gradient(135deg, #02404F 0%, #013B47 55%, #02404F 100%)' }}
    >
      <div className="bg-white rounded-2xl p-10 w-full max-w-sm shadow-2xl text-center">
        <img src="/logo.jfif" alt="Kifiya" className="w-16 h-16 rounded-xl mx-auto mb-4 object-contain" />
        <h2 className="text-xl font-extrabold text-navy mb-1">Kifiya Executive Dashboard</h2>
        <p className="text-xs text-muted mb-7">Sign in with your Kifiya credentials</p>

        <input
          className="w-full border border-border rounded-xl px-4 py-3 text-sm font-medium text-navy outline-none mb-3 focus:border-navy transition-colors"
          type="text"
          placeholder="Username"
          value={user}
          onChange={e => setUser(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && document.getElementById('kif-pass')?.focus()}
          autoComplete="username"
        />
        <input
          id="kif-pass"
          className="w-full border border-border rounded-xl px-4 py-3 text-sm font-medium text-navy outline-none mb-4 focus:border-navy transition-colors"
          type="password"
          placeholder="Password"
          value={pass}
          onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoComplete="current-password"
        />

        <button
          onClick={submit}
          disabled={busy}
          className="w-full bg-navy text-white rounded-xl py-3 text-sm font-bold hover:bg-navy-dark transition-colors disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        {err && <p className="text-danger text-xs font-semibold mt-3">{err}</p>}
      </div>
    </div>
  )
}
