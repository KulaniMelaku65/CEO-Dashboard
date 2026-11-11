import { useState, useEffect } from 'react'
import { adminUsers, aiSettings } from '../lib/api.js'
import { PAGE_REGISTRY } from '../lib/pages.js'
import { KPI_DEPARTMENTS } from './kpi/departments.js'

const KPI_ROLE_OPTIONS = [
  { value: '',              label: 'No KPI access' },
  { value: 'dept_head',     label: 'Department Head' },
  { value: 'approver',      label: 'Approver (CFO / Chief of Staff)' },
  { value: 'exec_viewer',   label: 'Exec Viewer (CEO / ExCo)' },
  { value: 'finance_admin', label: 'Finance / Core Analytics Admin' },
  { value: 'auditor',       label: 'Read-only / Audit' },
]

const NAVY  = '#0F5565'
const TEAL  = '#12707F'
const ORANGE = '#EB7D23'
const RED   = '#D32F2F'

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

// Sensitive capabilities *within* a page, not pages of their own — so they're kept out of
// PAGE_REGISTRY (no sidebar entry, no separate "page" to grant access to) but still reuse
// user_page_access as a plain permission flag, same update call as any real page. Payroll
// Currency Corrections lives on Organization Mapping for every user who can reach that
// page, but only relabels payroll currency tags for CTC purposes — sensitive enough that
// not everyone with Organization Mapping access should be able to use it. Backend check:
// routes/payroll-currency-corrections.js's requireFeatureAccess.
const FEATURE_FLAGS = [
  { id: 'payroll-currency-corrections', label: 'Payroll Currency Corrections' },
]
const FEATURE_IDS = new Set(FEATURE_FLAGS.map(f => f.id))
const countPages = (pageIds) => pageIds.filter(id => !FEATURE_IDS.has(id)).length

// 12-char strong default — just a starting point the admin can overwrite or reuse; the
// only requirement enforced server-side is 8+ characters.
function suggestPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

function CredentialsBanner({ info, onDismiss }) {
  const [copied, setCopied] = useState(false)
  if (!info) return null
  const copy = () => {
    navigator.clipboard?.writeText(`Username: ${info.username}\nTemporary password: ${info.password}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => {})
  }
  return (
    <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: `${ORANGE}55`, background: `${ORANGE}12` }}>
      <span className="text-lg" style={{ color: ORANGE }}>ⓘ</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-ink mb-1">
          Send these to {info.name} yourself (email, Slack, in person) — email sending isn't configured yet, so this is shown once and not stored anywhere retrievable.
        </p>
        <div className="text-xs font-mono bg-white/60 rounded-lg px-3 py-2 inline-block">
          <div><strong>Username:</strong> {info.username}</div>
          <div><strong>Temporary password:</strong> {info.password}</div>
        </div>
        <p className="text-[10px] text-muted mt-1.5">They'll be required to set their own password the first time they log in.</p>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button onClick={copy} className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-border text-ink hover:border-navy">
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button onClick={onDismiss} className="text-[11px] font-bold px-2.5 py-1 rounded-lg text-muted hover:text-ink">
          Dismiss
        </button>
      </div>
    </div>
  )
}

// KPI Role + (when Department Head) Department dropdown pair, shared by the create form
// and each existing user's row.
function KpiRoleFields({ kpiRole, kpiDepartmentId, onRoleChange, onDeptChange, disabled }) {
  return (
    <div className="flex gap-2">
      <select
        value={kpiRole}
        onChange={e => onRoleChange(e.target.value)}
        disabled={disabled}
        className="text-xs border border-border rounded-xl px-2.5 py-2 text-ink outline-none focus:border-navy disabled:opacity-40"
      >
        {KPI_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {kpiRole === 'dept_head' && (
        <select
          value={kpiDepartmentId || ''}
          onChange={e => onDeptChange(e.target.value)}
          disabled={disabled}
          className="text-xs border border-border rounded-xl px-2.5 py-2 text-ink outline-none focus:border-navy disabled:opacity-40"
        >
          <option value="">Which department?</option>
          {KPI_DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
    </div>
  )
}

function AddUserForm({ onCreated }) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [title, setTitle] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [pageIds, setPageIds] = useState([])
  const [kpiRole, setKpiRole] = useState('')
  const [kpiDepartmentId, setKpiDepartmentId] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  const togglePage = (id) => setPageIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  // Suggest a username from the email as a convenience — only while the admin hasn't
  // typed their own, so it never overwrites a deliberate choice.
  const handleEmailChange = (val) => {
    setEmail(val)
    if (!usernameTouched) {
      const suggested = val.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '')
      setUsername(suggested)
    }
  }

  const submit = async () => {
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return }
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) { setError('Username must be 3-32 characters: letters, numbers, dot, underscore, or hyphen.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setBusy(true); setError('')
    try {
      const r = await adminUsers.create({
        name: name.trim(), email: email.trim(), username, password,
        title: title.trim() || null, isAdmin, pageIds,
        kpiRole: kpiRole || null, kpiDepartmentId: kpiRole === 'dept_head' ? (kpiDepartmentId || null) : null
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to create user.')
      onCreated({ name: name.trim(), username: j.username, password })
      setName(''); setEmail(''); setUsername(''); setUsernameTouched(false); setPassword('')
      setTitle(''); setIsAdmin(false); setPageIds([]); setKpiRole(''); setKpiDepartmentId('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-5">
      <h3 className="text-sm font-bold text-ink mb-4">Add a viewer</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
          className="text-xs border border-border rounded-xl px-3 py-2.5 text-ink outline-none focus:border-navy" />
        <input value={email} onChange={e => handleEmailChange(e.target.value)} placeholder="Email address" type="email"
          className="text-xs border border-border rounded-xl px-3 py-2.5 text-ink outline-none focus:border-navy" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <input
          value={username}
          onChange={e => { setUsername(e.target.value.toLowerCase()); setUsernameTouched(true) }}
          placeholder="Login username"
          className="text-xs border border-border rounded-xl px-3 py-2.5 text-ink outline-none focus:border-navy"
        />
        <div className="flex gap-1.5">
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Temporary password"
            className="flex-1 min-w-0 text-xs border border-border rounded-xl px-3 py-2.5 text-ink outline-none focus:border-navy font-mono"
          />
          <button
            type="button"
            onClick={() => setPassword(suggestPassword())}
            title="Suggest a strong password"
            className="text-[11px] font-bold px-2.5 rounded-xl border border-border text-ink hover:border-navy flex-shrink-0"
          >
            Generate
          </button>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Job title"
          className="text-xs border border-border rounded-xl px-3 py-2.5 text-ink outline-none focus:border-navy" />
      </div>

      <label className="flex items-center gap-2 mb-4 cursor-pointer w-fit">
        <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} className="w-3.5 h-3.5" />
        <span className="text-xs font-semibold text-ink">Grant admin access (can manage users and permissions)</span>
      </label>

      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Group KPI Dashboard role</p>
      <div className="mb-4">
        <KpiRoleFields
          kpiRole={kpiRole}
          kpiDepartmentId={kpiDepartmentId}
          onRoleChange={r => { setKpiRole(r); if (r !== 'dept_head') setKpiDepartmentId('') }}
          onDeptChange={setKpiDepartmentId}
        />
      </div>

      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Visible pages</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TOGGLE_PAGES.map(p => {
          const on = pageIds.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => togglePage(p.id)}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all"
              style={on ? { background: NAVY, color: '#fff', borderColor: NAVY } : { borderColor: '#D7DEE6', color: '#6B7780' }}
            >
              {p.parentId && <span className="opacity-60">↳ </span>}{p.label}
            </button>
          )
        })}
      </div>

      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Sensitive features</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FEATURE_FLAGS.map(f => {
          const on = pageIds.includes(f.id)
          return (
            <button
              key={f.id}
              onClick={() => togglePage(f.id)}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all"
              style={on ? { background: ORANGE, color: '#fff', borderColor: ORANGE } : { borderColor: '#D7DEE6', color: '#6B7780' }}
            >
              {f.label}
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

  const updateKpiRole = async (kpiRole) => {
    setBusy(true)
    try {
      const r = await adminUsers.update(u.id, { kpiRole: kpiRole || null, kpiDepartmentId: kpiRole === 'dept_head' ? u.kpiDepartmentId : null })
      const j = await r.json()
      if (r.ok) onChanged(j)
    } finally {
      setBusy(false)
    }
  }

  const updateKpiDepartment = async (kpiDepartmentId) => {
    setBusy(true)
    try {
      const r = await adminUsers.update(u.id, { kpiRole: u.kpiRole, kpiDepartmentId: kpiDepartmentId || null })
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
      if (r.ok) setResetInfo({ name: u.name, username: u.username, password: j.generatedPassword })
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
          <p className="text-xs font-bold text-ink truncate">
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

        <KpiRoleFields
          kpiRole={u.kpiRole || ''}
          kpiDepartmentId={u.kpiDepartmentId}
          onRoleChange={updateKpiRole}
          onDeptChange={updateKpiDepartment}
          disabled={busy}
        />

        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border text-ink hover:border-navy flex-shrink-0"
        >
          Pages ({countPages(u.pageIds)}) {expanded ? '▾' : '▸'}
        </button>
        <button onClick={resetPassword} disabled={busy} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border text-ink hover:border-navy flex-shrink-0 disabled:opacity-40">
          Reset Password
        </button>
        <button onClick={remove} disabled={busy || isSelf} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border flex-shrink-0 disabled:opacity-40" style={{ color: RED }}>
          Remove
        </button>
      </div>

      {resetInfo && (
        <div className="px-5 pb-3.5">
          <CredentialsBanner info={resetInfo} onDismiss={() => setResetInfo(null)} />
        </div>
      )}

      {expanded && (
        <div className="px-5 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {TOGGLE_PAGES.map(p => {
              const on = u.pageIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => togglePage(p.id)}
                  disabled={busy}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all disabled:opacity-40"
                  style={on ? { background: TEAL, color: '#fff', borderColor: TEAL } : { borderColor: '#D7DEE6', color: '#6B7780' }}
                >
                  {p.parentId && <span className="opacity-60">↳ </span>}{p.label}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mt-3 mb-1.5">Sensitive features</p>
          <div className="flex flex-wrap gap-1.5">
            {FEATURE_FLAGS.map(f => {
              const on = u.pageIds.includes(f.id)
              return (
                <button
                  key={f.id}
                  onClick={() => togglePage(f.id)}
                  disabled={busy}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all disabled:opacity-40"
                  style={on ? { background: ORANGE, color: '#fff', borderColor: ORANGE } : { borderColor: '#D7DEE6', color: '#6B7780' }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const AI_PROVIDER_LABELS = { gemini: 'Gemini', openai: 'OpenAI', groq: 'Groq', claude: 'Claude' }

// Lets an admin set the chatbot's provider + API key here instead of editing .env on the
// server. GET /api/ai-settings only ever returns booleans/metadata, never the stored key —
// routes/ai-settings.js never serializes api_key back out.
function AiAssistantSettings() {
  const [providers, setProviders] = useState([])
  const [activeProvider, setActiveProvider] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState({})     // { [provider]: { apiKey, model } }
  const [busy, setBusy] = useState(null)        // provider currently saving/removing, or 'active'

  const load = () => {
    setLoading(true)
    aiSettings.list()
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load AI settings.')))
      .then(j => { setProviders(j.providers); setActiveProvider(j.activeProvider) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const draftFor = (id) => drafts[id] || { apiKey: '', model: '' }
  const setDraft = (id, patch) => setDrafts(d => ({ ...d, [id]: { ...draftFor(id), ...patch } }))

  const saveKey = async (id) => {
    const { apiKey, model } = draftFor(id)
    if (!apiKey.trim()) { setError('Enter an API key first.'); return }
    setBusy(id); setError('')
    try {
      const r = await aiSettings.setKey(id, apiKey.trim(), model.trim() || null)
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to save key.')
      setDrafts(d => ({ ...d, [id]: { apiKey: '', model: '' } }))
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const removeKey = async (id) => {
    setBusy(id); setError('')
    try {
      const r = await aiSettings.removeKey(id)
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to remove key.')
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const setActive = async (id) => {
    setBusy('active'); setError('')
    try {
      const r = await aiSettings.setActive(id)
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to set active provider.')
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-5">
      <h3 className="text-sm font-bold text-ink mb-1">AI Assistant</h3>
      <p className="text-xs text-muted font-medium mb-4">
        Configure which provider powers the chatbot and its API key, instead of editing
        the server's .env file. Keys are stored server-side and never shown again once saved.
      </p>

      {error && <p className="text-xs font-semibold mb-3" style={{ color: RED }}>{error}</p>}
      {loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-extrabold text-muted uppercase tracking-wider">Active provider</span>
            <select
              value={activeProvider || 'auto'}
              onChange={e => setActive(e.target.value)}
              disabled={busy === 'active'}
              className="text-xs border border-border rounded-xl px-2.5 py-1.5 text-ink outline-none focus:border-navy disabled:opacity-40"
            >
              <option value="auto">Auto (first configured provider)</option>
              {providers.map(p => <option key={p.id} value={p.id}>{AI_PROVIDER_LABELS[p.id]}</option>)}
            </select>
          </div>

          {providers.map(p => {
            const draft = draftFor(p.id)
            return (
              <div key={p.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-ink">{AI_PROVIDER_LABELS[p.id]}</span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={p.configured ? { background: `${TEAL}18`, color: TEAL } : { background: '#D7DEE655', color: '#6B7780' }}
                  >
                    {p.configured ? 'Key configured' : 'Not configured (falls back to .env)'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <input
                    value={draft.apiKey}
                    onChange={e => setDraft(p.id, { apiKey: e.target.value })}
                    placeholder={p.configured ? 'Enter a new key to replace it' : 'API key'}
                    type="password"
                    className="flex-1 min-w-[180px] text-xs border border-border rounded-xl px-3 py-2 text-ink outline-none focus:border-navy font-mono"
                  />
                  <input
                    value={draft.model}
                    onChange={e => setDraft(p.id, { model: e.target.value })}
                    placeholder={p.model ? `Model (${p.model})` : 'Model override (optional)'}
                    className="flex-1 min-w-[140px] text-xs border border-border rounded-xl px-3 py-2 text-ink outline-none focus:border-navy"
                  />
                  <button
                    onClick={() => saveKey(p.id)}
                    disabled={busy === p.id}
                    className="text-[11px] font-bold px-3 py-2 rounded-xl text-white disabled:opacity-40"
                    style={{ background: NAVY }}
                  >
                    Save
                  </button>
                  {p.configured && (
                    <button
                      onClick={() => removeKey(p.id)}
                      disabled={busy === p.id}
                      className="text-[11px] font-bold px-3 py-2 rounded-xl border border-border text-ink hover:border-navy disabled:opacity-40"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
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
        <h2 className="text-lg font-extrabold text-ink mb-0.5">Admin — Users &amp; Access</h2>
        <p className="text-xs text-muted font-medium">
          Create viewer accounts and control which dashboard pages each person can see.
          Choose their username and a temporary password here, then send both to them
          yourself — email delivery isn't configured yet. They'll set their own password
          the first time they log in.
        </p>
      </div>

      <CredentialsBanner info={createdInfo} onDismiss={() => setCreatedInfo(null)} />

      <AddUserForm onCreated={(j) => { setCreatedInfo(j); load() }} />

      <AiAssistantSettings />

      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-bold text-ink">All Users {users.length > 0 && `(${users.length})`}</h3>
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
