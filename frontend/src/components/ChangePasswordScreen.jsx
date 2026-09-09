import { useState } from 'react'
import { auth } from '../lib/api.js'

// Shown instead of the dashboard whenever the logged-in user still has the default
// password an admin generated for them — blocks access until they set their own.
export default function ChangePasswordScreen({ onDone, onLogout }) {
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr]         = useState('')
  const [busy, setBusy]       = useState(false)

  const submit = async () => {
    setErr('')
    if (!current || !next || !confirm) return
    if (next.length < 8) { setErr('New password must be at least 8 characters.'); return }
    if (next !== confirm) { setErr('New password and confirmation do not match.'); return }
    setBusy(true)
    try {
      const r = await auth.changePassword(current, next)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to change password.')
      onDone()
    } catch (e) {
      setErr(e.message)
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
        <h2 className="text-xl font-extrabold text-navy mb-1">Set Your Password</h2>
        <p className="text-xs text-muted mb-7">
          You're signed in with a temporary password — set your own before continuing.
        </p>

        <input
          className="w-full border border-border rounded-xl px-4 py-3 text-sm font-medium text-navy outline-none mb-3 focus:border-navy transition-colors"
          type="password"
          placeholder="Current (temporary) password"
          value={current}
          onChange={e => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
        <input
          className="w-full border border-border rounded-xl px-4 py-3 text-sm font-medium text-navy outline-none mb-3 focus:border-navy transition-colors"
          type="password"
          placeholder="New password (min. 8 characters)"
          value={next}
          onChange={e => setNext(e.target.value)}
          autoComplete="new-password"
        />
        <input
          className="w-full border border-border rounded-xl px-4 py-3 text-sm font-medium text-navy outline-none mb-4 focus:border-navy transition-colors"
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoComplete="new-password"
        />

        <button
          onClick={submit}
          disabled={busy}
          className="w-full bg-navy text-white rounded-xl py-3 text-sm font-bold hover:bg-navy-dark transition-colors disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Set Password & Continue'}
        </button>

        {err && <p className="text-danger text-xs font-semibold mt-3">{err}</p>}

        <button onClick={onLogout} className="text-[11px] text-muted hover:text-navy font-semibold mt-5">
          Sign out instead
        </button>
      </div>
    </div>
  )
}
