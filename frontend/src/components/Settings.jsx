import { useEffect, useState } from 'react'
import {
  clearLocalData, deleteAccount, getAccounts, getSettings, startOAuth,
  testTriageConnection, triggerAccountSync, updateSettings,
} from '../api/client'

/**
 * Full settings surface. Most fields debounce-PUT on change; destructive or
 * long-running actions (add account, test connection, clear data) are explicit
 * buttons. Triage "test connection" is the one network call we surface inline
 * status for.
 */
export default function Settings({ onToast, onSettingsChanged, onAccountsChanged }) {
  const [settings, setSettings] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [credentialsConfigured, setCredentialsConfigured] = useState(false)
  const [busy, setBusy] = useState('')
  const [conn, setConn] = useState(null)
  const [oauthRunning, setOauthRunning] = useState(false)

  async function loadAll() {
    const [s, a] = await Promise.all([getSettings(), getAccounts()])
    setSettings(s)
    setAccounts(a.accounts)
    setCredentialsConfigured(a.credentials_configured)
  }

  useEffect(() => { loadAll().catch((e) => onToast?.error(`Settings load failed: ${e.message}`)) }, [])

  async function put(patch) {
    setSettings((s) => ({ ...s, ...patch }))
    try {
      const updated = await updateSettings(patch)
      setSettings(updated)
      onSettingsChanged?.(updated)
    } catch (e) {
      onToast?.error(`Save failed: ${e.message}`)
    }
  }

  async function handleAddAccount() {
    setOauthRunning(true)
    onToast?.info('Opening browser for Gmail consent…')
    try {
      const { account } = await startOAuth()
      onToast?.success(`Connected ${account.email}. Syncing…`)
      await loadAll()
      onAccountsChanged?.()
      // Kick off the initial fetch in the background.
      triggerAccountSync(account.id).catch(() => {})
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message
      onToast?.error(`Add account failed: ${msg}`)
    } finally {
      setOauthRunning(false)
    }
  }

  async function handleTestConnection() {
    setBusy('conn')
    setConn(null)
    try {
      const res = await testTriageConnection()
      setConn(res)
      if (res.ok && res.model_available) {
        onToast?.success(`Ollama up — model ${res.configured_model} available.`)
      } else if (res.ok) {
        onToast?.error(`Model ${res.configured_model} not pulled. Models present: ${res.models.join(', ') || 'none'}`)
      } else {
        onToast?.error(`Ollama unreachable: ${res.error}`)
      }
    } catch (e) {
      onToast?.error(`Connection test failed: ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  async function handleRemove(id, email) {
    if (!confirm(`Remove account ${email}? Its cached emails will be deleted (tokens are wiped too).`)) return
    try {
      await deleteAccount(id)
      onToast?.success(`Removed ${email}.`)
      await loadAll()
      onAccountsChanged?.()
    } catch (e) {
      onToast?.error(`Remove failed: ${e.message}`)
    }
  }

  async function handleClearData() {
    if (!confirm('Clear ALL local email data? Your saved Gmail tokens are kept, but every cached email will be deleted. This cannot be undone.')) return
    try {
      const res = await clearLocalData()
      onToast?.success(`Cleared ${res.cleared_emails} emails.`)
      onAccountsChanged?.()
    } catch (e) {
      onToast?.error(`Clear failed: ${e.message}`)
    }
  }

  if (!settings) {
    return <div className="flex-1 p-8 text-ink-400 text-sm">Loading settings…</div>
  }

  return (
    <div className="flex-1 overflow-y-auto bg-ink-950">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        <header>
          <h1 className="text-xl font-semibold text-ink-100">Settings</h1>
          <p className="text-sm text-ink-400 mt-1">Everything runs locally. No data leaves this machine.</p>
        </header>

        {/* Accounts */}
        <Section title="Gmail Accounts" subtitle="OAuth tokens are Fernet-encrypted in ~/.mailmind/accounts.json.">
          {!credentialsConfigured && (
            <Note kind="warn">
              No <code className="font-mono">credentials.json</code> found in <code className="font-mono">backend/</code>.
              See the README to create Gmail OAuth Desktop credentials, then restart the backend.
            </Note>
          )}
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 bg-ink-900 border border-ink-800 rounded-md px-3 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[13px] text-ink-200 truncate">{a.email}</div>
                  <div className="font-mono text-[11px] text-ink-500">
                    {a.needs_reauth ? '⚠ needs re-auth' : a.last_synced_at ? `synced ${new Date(a.last_synced_at).toLocaleString()}` : 'never synced'}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(a.id, a.email)}
                  className="text-[12px] text-ink-400 hover:text-red-300 px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ))}
            {accounts.length === 0 && <p className="text-sm text-ink-500">No accounts yet.</p>}
          </div>
          <button
            onClick={handleAddAccount}
            disabled={!credentialsConfigured || oauthRunning}
            className="mt-3 px-3 py-2 rounded-md text-sm bg-accent-amber text-ink-950 font-medium hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {oauthRunning ? 'Waiting for consent…' : '+ Add Gmail Account'}
          </button>
        </Section>

        {/* Sync */}
        <Section title="Sync" subtitle="Background sync interval + initial fetch size.">
          <Field label="Sync interval">
            <Select value={settings.sync_interval_minutes} onChange={(v) => put({ sync_interval_minutes: Number(v) })}
              options={[1, 5, 15, 30].map((m) => ({ value: m, label: `Every ${m} min` }))} />
          </Field>
          <Field label="Initial fetch count">
            <Select value={settings.initial_fetch_count} onChange={(v) => put({ initial_fetch_count: Number(v) })}
              options={[100, 500, 1000].map((n) => ({ value: n, label: `${n} emails` }))} />
          </Field>
        </Section>

        {/* Ollama / triage */}
        <Section title="Local LLM (Ollama)" subtitle="The model that classifies email importance.">
          <Field label="Ollama base URL">
            <input value={settings.ollama_base_url} onChange={(e) => put({ ollama_base_url: e.target.value })}
              className="input" />
          </Field>
          <Field label="Model">
            <input value={settings.ollama_model} onChange={(e) => put({ ollama_model: e.target.value })}
              placeholder="gemma3:4b" className="input font-mono" />
          </Field>
          <button onClick={handleTestConnection} disabled={busy === 'conn'}
            className="px-3 py-2 rounded-md text-sm border border-ink-700 text-ink-200 hover:bg-ink-850 disabled:opacity-40">
            {busy === 'conn' ? 'Testing…' : 'Test Connection'}
          </button>
          {conn && (
            <div className={`mt-2 text-[13px] ${conn.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {conn.ok
                ? `Connected. ${conn.models.length} model(s) available${conn.model_available ? '' : ` — but "${conn.configured_model}" is not one of them. Run: ollama pull ${conn.configured_model}`}.`
                : `Unreachable: ${conn.error}`}
              {conn.ok && conn.models.length > 0 && (
                <div className="mt-1 font-mono text-[11px] text-ink-400">{conn.models.join(' · ')}</div>
              )}
            </div>
          )}
        </Section>

        {/* Triage behavior */}
        <Section title="Triage Behavior">
          <Toggle label="Auto-scan new emails after sync"
            checked={settings.auto_scan} onChange={(v) => put({ auto_scan: v })} />
          <Field label={`Importance threshold (score ≥ ${settings.importance_threshold} shown in Important)`}>
            <input type="range" min={0} max={10} value={settings.importance_threshold}
              onChange={(e) => put({ importance_threshold: Number(e.target.value) })}
              className="w-full accent-amber-500" />
          </Field>
        </Section>

        {/* Appearance + demo */}
        <Section title="Appearance & Data">
          <Toggle label="Dark mode" checked={settings.dark_mode} onChange={(v) => put({ dark_mode: v })} />
          <Toggle label="Demo mode (seed mock emails)" checked={settings.mock_mode} onChange={(v) => put({ mock_mode: v })} />
          <button onClick={handleClearData}
            className="mt-2 px-3 py-2 rounded-md text-sm border border-red-500/40 text-red-300 hover:bg-red-500/10">
            Clear Local Data
          </button>
        </Section>
      </div>

      {/* Tailwind class shorthands injected once. */}
      <style>{`
        .input { width: 100%; background: #1a1a1a; border: 1px solid #262626; border-radius: 6px; padding: 8px 10px; font-size: 13px; color: #d4d4d4; }
        .input:focus { outline: none; border-color: #4b4b4b; }
      `}</style>
    </div>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
      {subtitle && <p className="text-[12px] text-ink-500 mt-0.5 mb-3">{subtitle}</p>}
      <div className="space-y-3 mt-3">{children}</div>
    </section>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-ink-400 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      {options.map((o) => <option key={o.value} value={o.value} className="bg-ink-900">{o.label}</option>)}
    </select>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm text-ink-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-accent-amber' : 'bg-ink-700'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )
}

function Note({ kind = 'info', children }) {
  const styles = kind === 'warn'
    ? 'border-amber-500/40 bg-amber-500/5 text-amber-200'
    : 'border-ink-700 bg-ink-900 text-ink-300'
  return <div className={`text-[13px] border rounded-md px-3 py-2 ${styles}`}>{children}</div>
}
