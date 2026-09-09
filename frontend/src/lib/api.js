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
  changePassword: (currentPassword, newPassword) => req('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword })
  }),
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

export const budget = {
  names: ()     => req('/api/bc/budget-names'),
  data:  (name) => req(`/api/bc/budget/${encodeURIComponent(name)}`),
}

export const departmentOverrides = {
  list: () => req('/api/department-overrides'),
  set: (employeeNo, employeeName, fromSection, sectionCode) => req('/api/department-overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeNo, employeeName, fromSection, sectionCode })
  }),
  remove: (employeeNo) => req(`/api/department-overrides/${encodeURIComponent(employeeNo)}`, { method: 'DELETE' }),
}

export const adminUsers = {
  list:   () => req('/api/admin/users'),
  create: (user) => req('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  }),
  update: (id, patch) => req(`/api/admin/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  }),
  resetPassword: (id) => req(`/api/admin/users/${id}/reset-password`, { method: 'POST' }),
  remove: (id) => req(`/api/admin/users/${id}`, { method: 'DELETE' }),
}
