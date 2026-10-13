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
  names:   ()     => req('/api/bc/budget-names'),
  data:    (name) => req(`/api/bc/budget/${encodeURIComponent(name)}`),
  default: ()     => req('/api/bc/budget-default'),
}

export const departmentOverrides = {
  list: () => req('/api/department-overrides'),
  set: (employeeNo, employeeName, fromSection, sectionCode) => req('/api/department-overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeNo, employeeName, fromSection, sectionCode })
  }),
  remove: (employeeNo) => req(`/api/department-overrides/${encodeURIComponent(employeeNo)}`, { method: 'DELETE' }),
  history: (employeeNo) => req(`/api/department-overrides/${encodeURIComponent(employeeNo)}/history`),
}

export const kpi = {
  departments: () => req('/api/kpi/departments'),
  dictionary:  (department) => req(`/api/kpi/dictionary${department ? `?department=${encodeURIComponent(department)}` : ''}`),
  createDictionaryRow: (fields) => req('/api/kpi/dictionary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields)
  }),
  updateDictionaryRow: (id, patch) => req(`/api/kpi/dictionary/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  }),
  removeDictionaryRow: (id) => req(`/api/kpi/dictionary/${id}`, { method: 'DELETE' }),
  approveDictionaryChange: (id) => req(`/api/kpi/dictionary/${id}/approve-change`, { method: 'POST' }),
  rejectDictionaryChange:  (id) => req(`/api/kpi/dictionary/${id}/reject-change`, { method: 'POST' }),
  submissions: (department, period) => req(`/api/kpi/submissions?department=${encodeURIComponent(department)}&period=${period}`),
  saveDraft: (departmentId, period, values) => req('/api/kpi/submissions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ departmentId, period, values })
  }),
  submit: (departmentId, period) => req('/api/kpi/submissions/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ departmentId, period })
  }),
  approve: (id) => req(`/api/kpi/submissions/${id}/approve`, { method: 'POST' }),
  reject:  (id) => req(`/api/kpi/submissions/${id}/reject`, { method: 'POST' }),
  reopen:  (id) => req(`/api/kpi/submissions/${id}/reopen`, { method: 'POST' }),
  overview:  (period) => req(`/api/kpi/overview${period ? `?period=${period}` : ''}`),
  department: (id, period) => req(`/api/kpi/department/${id}${period ? `?period=${period}` : ''}`),
  reminders: (period) => req(`/api/kpi/reminders${period ? `?period=${period}` : ''}`),
  audit: (entity, id) => req(`/api/kpi/audit${entity ? `?entity=${entity}&id=${id}` : ''}`),
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
