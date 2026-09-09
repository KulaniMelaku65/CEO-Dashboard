import { useState, useEffect } from 'react'
import { adminUsers } from '../lib/api.js'
import { PAGE_REGISTRY } from '../lib/pages.js'

const NAVY  = '#02404F'
const TEAL  = '#1FB6A6'
const ORANGE = '#EB7D23'
const RED   = '#E5544B'

function Toggle({ on, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative rounded-full transition-colors disabled:opacity-40"
      style={{ width: 34, height: 19, background: on ? TEAL : '#D7DEE6' }}
    >
      <span
        className="absolute top-[2px] rounded-full bg-white transition-all shadow"
        style={{ width: 15, height: 15, left: on ? 17 : 2 }}
      />
    </button>
  )
}

// Every page a person could plausibly be granted, in registry order, with a light
// visual hint for the ones nested under a parent (Employee Cost, Organization Mapping…).
const TOGGLE_PAGES = PAGE_REGISTRY

function GeneratedPasswordBanner({ info, onDismiss }) {
  const [copied, setCopied] = useState(false)
  if (!info) return null
  const copy = () => {
    navigator.clipboard?.writeText(`Username: ${info.username}\nTemporary password: ${info.generatedPassword}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => {})
  }
  return (
    <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: `${ORANGE}55`, background: `${ORANGE}12` }}>
      <span className="text-lg" style={{ color: ORANGE }}>ⓘ</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-navy mb-1">
          Share these credentials with {info.name} — email sending isn't configured yet, so this is shown once and not stored anywhere retrievable.
        </p>
        <div className="text-xs font-mono bg-white/60 rounded-lg px-3 py-2 inline-block">
          <div><strong>Username:</strong> {info.username}</div>
          <div><strong>Temporary password:</strong> {info.generatedPassword}</div>
        </div>
        <p className="text-[10px] text-muted mt-1.5">They'll be required to set their own password the first time they log in.</p>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button onClick={copy} className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-border text-navy hover:border-navy">
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button onClick={onDismiss} className="text-[11px] font-bold px-2.5 py-1 rounded-lg text-muted hover:text-navy">
          Dismiss
        </button>
      </div>
    </div>
  )
}

function AddUserForm({ onCreated }) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [pageIds, setPageIds] = useState([])
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  const togglePage = (id) => setPageIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const submit = async () => {
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return }
    setBusy(true); setError('')
    try {
      const r = await adminUsers.create({ name: name.trim(), email: email.trim(), title: title.trim() || null, isAdmin, pageIds })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to create user.')
      onCreated(j)
      setName(''); setEmail(''); setTitle(''); setIsAdmin(false); setPageIds([])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-5">
      <h3 className="text-sm font-bold text-navy mb-4">Add a viewer</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
          className="text-xs border border-border rounded-xl px-3 py-2.5 text-navy outline-none focus:border-navy" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" type="email"
          className="text-xs border border-border rounded-xl px-3 py-2.5 text-navy outline-none focus:border-navy" />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Job title"
          className="text-xs border border-border rounded-xl px-3 py-2.5 text-navy outline-none focus:border-navy" />
      </div>

      <label className="flex items-center gap-2 mb-4 cursor-pointer w-fit">
        <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} className="w-3.5 h-3.5" />
        <span className="text-xs font-semibold text-navy">Grant admin access (can manage users and permissions)</span>
      </label>

      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Visible pages</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TOGGLE_PAGES.map(p => {
          const on = pageIds.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => togglePage(p.id)}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all"
              style={on ? { background: NAVY, color: '#fff', borderColor: NAVY } : { borderColor: '#D7DEE6', color: '#6B7C93' }}
            >
              {p.parentId && <span className="opacity-60">↳ </span>}{p.label}
            </button>
          )
        })}
      </div>

      {error && <p className="text-xs font-bold mb-3" style={{ color: RED }}>{error}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="text-xs font-bold px-4 py-2.5 rounded-xl text-white disabled:opacity-50"
        style={{ background: ORANGE }}
      >
        {busy ? 'Creating…' : 'Create User'}
      </button>
    </div>
  )
}

function UserRow({ u, currentUserId, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resetInfo, setResetInfo] = useState(null)

  const isSelf = u.id === currentUserId

  const togglePage = async (pageId) => {
    setBusy(true)
    try {
      const nextIds = u.pageIds.includes(pageId) ? u.pageIds.filter(x => x !== pageId) : [...u.pageIds, pageId]
      const r = await adminUsers.update(u.id, { pageIds: nextIds })
      const j = await r.json()
      if (r.ok) onChanged(j)
    } finally {
      setBusy(false)
    }
  }

  const toggleAdmin = async () => {
    if (isSelf) return
    setBusy(true)
    try {
      const r = await adminUsers.update(u.id, { isAdmin: !u.isAdmin })
      const j = await r.json()
      if (r.ok) onChanged(j)
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async () => {
    setBusy(true)
    try {
      const r = await adminUsers.resetPassword(u.id)
      const j = await r.json()
      if (r.ok) setResetInfo({ name: u.name, username: u.username, generatedPassword: j.generatedPassword })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (isSelf) return
    if (!confirm(`Remove ${u.name}'s access to the dashboard? This can't be undone.`)) return
    setBusy(true)
    try {
      const r = await adminUsers.remove(u.id)
      if (r.ok) onChanged(null, u.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="px-5 py-3.5 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-navy truncate">
            {u.name} {isSelf && <span className="text-[9px] font-extrabold text-muted">(you)</span>}
            {u.mustChangePassword && (
              <span className="ml-1.5 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: `${ORANGE}22`, color: ORANGE }}>
                TEMP PASSWORD
              </span>
            )}
          </p>
          <p className="text-[10px] text-muted truncate">{u.email} · {u.title || 'No title set'}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-bold text-muted">Admin</span>
          <Toggle on={u.isAdmin} onClick={toggleAdmin} disabled={busy || isSelf} />
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border text-navy hover:border-navy flex-shrink-0"
        >
          Pages ({u.pageIds.length}) {expanded ? '▾' : '▸'}
        </button>
        <button onClick={resetPassword} disabled={busy} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border text-navy hover:border-navy flex-shrink-0 disabled:opacity-40">
          Reset Password
        </button>
        <button onClick={remove} disabled={busy || isSelf} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border flex-shrink-0 disabled:opacity-40" style={{ color: RED }}>
          Remove
        </button>
      </div>

      {resetInfo && (
        <div className="px-5 pb-3.5">
          <GeneratedPasswordBanner info={resetInfo} onDismiss={() => setResetInfo(null)} />
        </div>
      )}

      {expanded && (
        <div className="px-5 pb-4 flex flex-wrap gap-1.5">
          {TOGGLE_PAGES.map(p => {
            const on = u.pageIds.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => togglePage(p.id)}
                disabled={busy}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all disabled:opacity-40"
                style={on ? { background: TEAL, color: '#fff', borderColor: TEAL } : { borderColor: '#D7DEE6', color: '#6B7C93' }}
              >
                {p.parentId && <span className="opacity-60">↳ </span>}{p.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AdminUsers({ currentUserId }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [createdInfo, setCreatedInfo] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    adminUsers.list()
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load users.')))
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleChanged = (updated, removedId) => {
    if (removedId != null) { setUsers(u => u.filter(x => x.id !== removedId)); return }
    setUsers(u => u.map(x => x.id === updated.id ? updated : x))
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-navy mb-0.5">Admin — Users &amp; Access</h2>
        <p className="text-xs text-muted font-medium">
          Create viewer accounts and control which dashboard pages each person can see.
          New users get a temporary password shown here once — email delivery isn't
          configured yet, so share it directly for now.
        </p>
      </div>

      <GeneratedPasswordBanner info={createdInfo} onDismiss={() => setCreatedInfo(null)} />

      <AddUserForm onCreated={(j) => { setCreatedInfo(j); load() }} />

      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-bold text-navy">All Users {users.length > 0 && `(${users.length})`}</h3>
        </div>
        {loading ? (
          <p className="text-xs px-5 py-4 text-muted">Loading…</p>
        ) : error ? (
          <p className="text-xs px-5 py-4 font-bold" style={{ color: RED }}>{error}</p>
        ) : users.length === 0 ? (
          <p className="text-xs px-5 py-4 text-muted">No users yet.</p>
        ) : (
          users.map(u => <UserRow key={u.id} u={u} currentUserId={currentUserId} onChanged={handleChanged} />)
        )}
      </div>
    </div>
  )
}
