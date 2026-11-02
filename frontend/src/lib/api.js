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

export const glDrilldown = {
  get: (accounts, asOf) => req(`/api/gl-drilldown?accounts=${accounts.join(',')}${asOf ? `&asOf=${asOf}` : ''}`),
}

export const cashflow = {
  // month omitted = that whole calendar year. Powers the Cashflow page's own
  // Year/Month filter, computed fresh server-side for whatever period is picked.
  get: (year, month) => req(`/api/cashflow?year=${year}${month ? `&month=${month}` : ''}`),
}

export const safeeBudget = {
  // months: array of 0-based PeriodTree month indices, relative to that budget year's
  // own ~12-month cycle — [] or omitted means the full year.
  overview: (months) => req(`/api/safee-budget/overview${months?.length ? `?months=${months.join(',')}` : ''}`),
  year: (budgetName, months, team, intervention) => {
    const params = new URLSearchParams({ budgetName })
    if (months?.length) params.set('months', months.join(','))
    if (team) params.set('team', team)
    if (intervention) params.set('intervention', intervention)
    return req(`/api/safee-budget/year?${params.toString()}`)
  },
  // The real BC entries behind one line's Utilized figure — click-the-number drilldown.
  drilldown: (budgetName, catCode, lineCode, months, team, intervention) => {
    const params = new URLSearchParams({ budgetName, catCode, lineCode })
    if (months?.length) params.set('months', months.join(','))
    if (team) params.set('team', team)
    if (intervention) params.set('intervention', intervention)
    return req(`/api/safee-budget/drilldown?${params.toString()}`)
  },
}

export const pageFilterSettings = {
  list: () => req('/api/page-filter-settings'),
  set:  (pageId, enabled) => req(`/api/page-filter-settings/${pageId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
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

export const budgetSourceOverrides = {
  list: () => req('/api/budget-source-overrides'),
  set: (employeeNo, employeeName, fromSource, budgetSource) => req('/api/budget-source-overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeNo, employeeName, fromSource, budgetSource })
  }),
  remove: (employeeNo) => req(`/api/budget-source-overrides/${encodeURIComponent(employeeNo)}`, { method: 'DELETE' }),
  history: (employeeNo) => req(`/api/budget-source-overrides/${encodeURIComponent(employeeNo)}/history`),
}

export const payrollCurrencyCorrections = {
  list: () => req('/api/payroll-currency-corrections'),
  set: (voucherNo, employeeNo, employeeName, correctCurrency, note) => req('/api/payroll-currency-corrections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voucherNo, employeeNo, employeeName, correctCurrency, note })
  }),
  remove: (voucherNo) => req(`/api/payroll-currency-corrections/${encodeURIComponent(voucherNo)}`, { method: 'DELETE' }),
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
