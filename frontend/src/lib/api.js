const req = (url, opts = {}) =>
  fetch(url, { credentials: 'include', ...opts })

export const auth = {
  me:     ()     => req('/api/auth/me'),
  login:  (u, p) => req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  }),
  logout: ()     => req('/api/auth/logout', { method: 'POST' }),
}

export const snapshots = {
  latest: ()  => req('/api/snapshots/latest'),
  dates:  ()  => req('/api/snapshots/dates'),
  byDate: d   => req(`/api/snapshots/${d}`),
  status: ()  => req('/api/snapshots/status'),
  sync:   (date) => req('/api/snapshots/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(date ? { date } : {})
  }),
}

export const superset = {
  chart: (id) => req(`/api/superset/${id}`),
}

export const ai = {
  chat: (messages) => req('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  })
}
