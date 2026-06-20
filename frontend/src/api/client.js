import axios from 'axios'

const api = axios.create({ baseURL: '', timeout: 60000 })

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------
export const getEmails = (params = {}) =>
  api.get('/emails', { params }).then((r) => r.data)

export const getEmail = (id) =>
  api.get(`/emails/${id}`).then((r) => r.data)

export const patchEmail = (id, body) =>
  api.patch(`/emails/${id}`, body).then((r) => r.data)

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export const getAccounts = () =>
  api.get('/accounts').then((r) => r.data)

// OAuth flow blocks until the browser consent completes server-side.
export const startOAuth = () =>
  api.post('/accounts/oauth/start', null, { timeout: 360000 }).then((r) => r.data)

export const triggerAccountSync = (id) =>
  api.post(`/accounts/${id}/sync`).then((r) => r.data)

export const deleteAccount = (id) =>
  api.delete(`/accounts/${id}`).then((r) => r.data)

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------
export const triggerSync = (background = true) =>
  api.post('/sync', null, { params: { background } }).then((r) => r.data)

export const getSyncStatus = () =>
  api.get('/sync/status').then((r) => r.data)

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------
export const testTriageConnection = () =>
  api.get('/triage/connection').then((r) => r.data)

export const warmupModel = (background = true) =>
  api.post('/triage/warmup', null, { params: { background } }).then((r) => r.data)

export const getModelStatus = () =>
  api.get('/triage/model-status').then((r) => r.data)

export const startScan = ({ background = true, rescan = false, limit } = {}) =>
  api.post('/triage/scan', null, {
    params: { background, rescan, ...(limit ? { limit } : {}) },
  }).then((r) => r.data)

export const getScanStatus = () =>
  api.get('/triage/status').then((r) => r.data)

export const rescanEmail = (id) =>
  api.post(`/triage/email/${id}`).then((r) => r.data)

export const cancelScan = () =>
  api.post('/triage/cancel').then((r) => r.data)

export const getTriageRules = () =>
  api.get('/triage/rules').then((r) => r.data)

export const updateTriageRules = (rules) =>
  api.put('/triage/rules', { rules }).then((r) => r.data)

export const switchModel = (model) =>
  api.post('/triage/model', { model }, { timeout: 1800000 }).then((r) => r.data)

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const getSettings = () =>
  api.get('/settings').then((r) => r.data)

export const updateSettings = (payload) =>
  api.put('/settings', payload).then((r) => r.data)

export const clearLocalData = () =>
  api.post('/settings/clear-data').then((r) => r.data)

export default api
