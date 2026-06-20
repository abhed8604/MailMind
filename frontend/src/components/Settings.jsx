import { useEffect, useState } from 'react'
import {
  clearLocalData, deleteAccount, getAccounts, getSettings, startOAuth,
  testTriageConnection, triggerAccountSync, updateSettings,
  getTriageRules, updateTriageRules, switchModel,
} from '../api/client'

/**
 * Full settings surface, restyled to match the glassmorphic home page.
 *
 * The icon sidebar rail is always visible (rendered by App.jsx), so this
 * component fills the area to the right of the rail. A back button in the
 * header returns to the inbox.
 *
 * Most fields debounce-PUT on change; destructive or long-running actions
 * (add account, test connection, clear data, switch model) are explicit
 * buttons.
 */
export default function Settings({ onBack, onToast, onSettingsChanged, onAccountsChanged, amoled, onAmoledChange, style, accountColorMap }) {
  const [settings, setSettings] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [credentialsConfigured, setCredentialsConfigured] = useState(false)
  const [busy, setBusy] = useState('')
  const [conn, setConn] = useState(null)
  const [oauthRunning, setOauthRunning] = useState(false)
  const [rules, setRules] = useState('')
  const [rulesDirty, setRulesDirty] = useState(false)
  const [rulesBusy, setRulesBusy] = useState(false)
  const [pendingModel, setPendingModel] = useState('')
  const [modelSwitching, setModelSwitching] = useState(false)

  async function loadAll() {
    const [s, a] = await Promise.all([getSettings(), getAccounts()])
    setSettings(s)
    setAccounts(a.accounts)
    setCredentialsConfigured(a.credentials_configured)
    // Load triage rules in background
    getTriageRules().then((r) => setRules(r.rules)).catch(() => {})
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
      const syncInfo = account.initial_sync || {}
      const count = syncInfo.fetched
      const err = syncInfo.error
      if (err) {
        onToast?.error(`Connected ${account.email} but sync failed: ${err}. Try "Sync now" in the inbox.`)
      } else {
        onToast?.success(`Connected ${account.email}. Fetched ${count ?? '?'} historical email(s).`)
      }
      await loadAll()
      onAccountsChanged?.()
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

  async function handleSaveRules() {
    setRulesBusy(true)
    try {
      await updateTriageRules(rules)
      setRulesDirty(false)
      onToast?.success('AI instructions saved. New scans will use updated rules.')
    } catch (e) {
      onToast?.error(`Save failed: ${e.message}`)
    } finally {
      setRulesBusy(false)
    }
  }

  async function handleSwitchModel() {
    const target = (pendingModel || '').trim()
    if (!target) {
      onToast?.error('Enter a model name first.')
      return
    }
    const current = settings.ollama_model
    if (target === current) {
      onToast?.info('That model is already configured.')
      return
    }
    if (!confirm(
      `Switch model from "${current}" to "${target}"?\n\n` +
      `This will DELETE "${current}" from Ollama to free disk space, then pull "${target}". ` +
      `Pulling can take several minutes for large models.`
    )) return
    setModelSwitching(true)
    onToast?.info(`Pulling "${target}" — this may take a while…`)
    try {
      const res = await switchModel(target)
      setSettings((s) => ({ ...s, ollama_model: res.model }))
      setPendingModel('')
      onSettingsChanged?.({ ollama_model: res.model })
      onToast?.success(`Switched to "${res.model}". Old model deleted.`)
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message
      onToast?.error(`Model switch failed: ${msg}`)
    } finally {
      setModelSwitching(false)
    }
  }

  if (!settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'rgba(255,255,255,0.32)' }}>
        Loading settings…
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-y-auto min-w-0"
      style={{ background: amoled ? '#000000' : '#16162a', ...style }}
    >
      {/* Back button — fixed to top-left of the viewport */}
      <button
        onClick={onBack}
        title="Back to inbox"
        aria-label="Back to inbox"
        className="fixed top-3 left-[60px] z-50 h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:text-white"
        style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.72)' }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="px-3.5 py-3 space-y-2">

        <h1 className="text-[14px] font-medium mb-2" style={{ color: 'rgba(255,255,255,0.80)' }}>Settings</h1>

        {/* AMOLED toggle */}
        <section className="rounded-lg px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <Toggle
            label="AMOLED mode"
            checked={!!amoled}
            onChange={(v) => onAmoledChange?.(v)}
            activeColor="#5B8DEF"
          />
        </section>

        {/* Accounts */}
        <Section title="Gmail Accounts" subtitle="OAuth tokens are Fernet-encrypted in ~/.mailmind/accounts.json.">
          {!credentialsConfigured && (
            <Note kind="warn">
              No <code className="font-mono">credentials.json</code> found in <code className="font-mono">backend/</code>.
              See the README to create Gmail OAuth Desktop credentials, then restart the backend.
            </Note>
          )}
          <div className="space-y-1.5">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: (accountColorMap && accountColorMap.get(a.id)?.color) || a.color }} />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[12px] truncate" style={{ color: 'rgba(255,255,255,0.80)' }}>{a.email}</div>
                  <div className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.32)' }}>
                    {a.needs_reauth ? '⚠ needs re-auth' : a.last_synced_at ? `synced ${new Date(a.last_synced_at).toLocaleString()}` : 'never synced'}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(a.id, a.email)}
                  className="text-[11px] px-1.5 py-0.5 transition-colors"
                  style={{ color: 'rgba(255,255,255,0.32)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#fca5a5' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.32)' }}
                >
                  Remove
                </button>
              </div>
            ))}
            {accounts.length === 0 && <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.32)' }}>No accounts yet.</p>}
          </div>
          <button
            onClick={handleAddAccount}
            disabled={!credentialsConfigured || oauthRunning}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#f59e0b', color: '#0b0b12' }}
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
          {/* Switch model: delete the current model and pull a new one */}
          <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Switch model (deletes <span className="font-mono" style={{ color: 'rgba(255,255,255,0.80)' }}>{settings.ollama_model || 'current'}</span> and pulls a new one)
            </div>
            <input
              value={pendingModel}
              onChange={(e) => setPendingModel(e.target.value)}
              placeholder="e.g. gemma3:4b, llama3.2:3b, hf.co/…"
              className="input font-mono"
              disabled={modelSwitching}
            />
            <button
              onClick={handleSwitchModel}
              disabled={modelSwitching || !pendingModel.trim()}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#f59e0b', color: '#0b0b12' }}
            >
              {modelSwitching ? 'Pulling… (this can take minutes)' : 'Delete & Pull New Model'}
            </button>
          </div>
          <button onClick={handleTestConnection} disabled={busy === 'conn'}
            className="px-3 py-1.5 rounded-lg text-[12px] transition-colors disabled:opacity-40"
            style={{ border: '0.5px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.72)' }}
            onMouseEnter={(e) => { if (busy !== 'conn') e.currentTarget.style.color = 'rgba(255,255,255,1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.72)' }}
          >
            {busy === 'conn' ? 'Testing…' : 'Test Connection'}
          </button>
          {conn && (
            <div className="mt-1 text-[12px]" style={{ color: conn.ok ? '#4ecf8e' : '#fca5a5' }}>
              {conn.ok
                ? `Connected. ${conn.models.length} model(s) available${conn.model_available ? '' : ` — but "${conn.configured_model}" is not one of them. Run: ollama pull ${conn.configured_model}`}.`
                : `Unreachable: ${conn.error}`}
              {conn.ok && conn.models.length > 0 && (
                <div className="mt-1 font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.32)' }}>{conn.models.join(' · ')}</div>
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
              className="w-full" style={{ accentColor: '#f59e0b' }} />
          </Field>
        </Section>

        {/* AI Instructions */}
        <Section title="AI Instructions" subtitle="Custom rules sent to the LLM alongside each email. Markdown supported.">
          <textarea
            value={rules}
            onChange={(e) => { setRules(e.target.value); setRulesDirty(true) }}
            rows={10}
            className="input font-mono text-[11px] leading-relaxed resize-y"
            placeholder="Loading…"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveRules}
              disabled={!rulesDirty || rulesBusy}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#f59e0b', color: '#0b0b12' }}
            >
              {rulesBusy ? 'Saving…' : 'Save Rules'}
            </button>
            {rulesDirty && <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.32)' }}>Unsaved changes</span>}
          </div>
        </Section>

        {/* Data */}
        <Section title="Data Management">
          <Toggle label="Demo mode (seed mock emails)" checked={settings.mock_mode} onChange={(v) => put({ mock_mode: v })} />
          <button onClick={handleClearData}
            className="px-3 py-1.5 rounded-full text-[12px] transition-colors"
            style={{ border: '0.5px solid rgba(248,113,113,0.4)', color: '#fca5a5' }}>
            Clear Local Data
          </button>
        </Section>
      </div>

      {/* Flat input style — no glass, no blur */}
      <style>{`
        .input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 0.5px solid rgba(255,255,255,0.09);
          border-radius: 8px;
          padding: 7px 10px;
          font-size: 12px;
          color: rgba(255,255,255,0.80);
          transition: border-color 0.15s ease;
        }
        .input::placeholder { color: rgba(255,255,255,0.3); }
        .input:focus { outline: none; border-color: #5B8DEF; }
        .input:disabled { opacity: 0.5; }
      `}</style>
    </div>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <section className="rounded-lg px-3.5 py-2.5 space-y-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div>
        <h2 className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.88)' }}>{title}</h2>
        {subtitle && <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.32)' }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, sublabel, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      {sublabel && <span className="block text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.32)' }}>{sublabel}</span>}
      {children}
    </label>
  )
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      {options.map((o) => <option key={o.value} value={o.value} style={{ background: '#1a1a1a' }}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ label, checked, onChange, activeColor }) {
  const trackColor = activeColor || '#f59e0b'
  return (
    <div className="flex items-center justify-between gap-4 cursor-pointer" onClick={() => onChange(!checked)}>
      <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.80)' }}>{label}</span>
      <span
        className="relative h-5 w-9 rounded-full block pointer-events-none"
        style={{ background: checked ? trackColor : 'rgba(255,255,255,0.12)' }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white block"
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
        />
      </span>
    </div>
  )
}

function Note({ kind = 'info', children }) {
  const styles = kind === 'warn'
    ? { border: '0.5px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.06)', color: '#fcd34d' }
    : { border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.55)' }
  return <div className="text-[11px] rounded-lg px-2.5 py-1.5" style={styles}>{children}</div>
}
