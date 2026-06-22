import { useEffect, useState } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip,
} from 'recharts'
import { BackIcon } from './Icon'
import { getAnalytics } from '../api/client'
import { CATEGORIES } from '../lib/categories'

/**
 * Dashboard view — analytics over the whole mailbox.
 *
 * Layout:
 *   - Summary cards row: Total / Read % / Important % / Spam %
 *   - Category donut chart
 *   - Percentage breakdown bars (Read vs Unread, Important vs Not, Spam vs Ham)
 *   - 30-day volume trend (area chart)
 *
 * Full-screen like Settings on mobile. On desktop it renders in the main
 * content area. All colours come from the theme CSS variables so it tracks
 * the active Default / Dark / Light / AMOLED palette.
 */
export default function Dashboard({ onBack, style }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getAnalytics().then(setData).catch((e) => setError(e.message || String(e)))
  }, [])

  if (error) {
    return (
      <div className="h-full overflow-y-auto min-w-0" style={{ background: 'var(--bg-settings)', ...style }}>
        <Shell onBack={onBack}>
          <div className="text-[12px]" style={{ color: '#fca5a5' }}>Failed to load analytics: {error}</div>
        </Shell>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="h-full overflow-y-auto min-w-0" style={{ background: 'var(--bg-settings)', ...style }}>
        <Shell onBack={onBack}>
          <div className="text-[12px]" style={{ color: 'var(--text-dim)' }}>Loading analytics…</div>
        </Shell>
      </div>
    )
  }

  const { summary, categories, trend } = data
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0)

  // Category slices for the donut, ordered consistently. Skip unscanned in
  // the donut (it is a "not yet processed" bucket, not a real category).
  const catOrder = ['action_required', 'deadline', 'financial', 'personal', 'newsletter', 'spam', 'other']
  const slices = catOrder
    .map((key) => ({ key, label: CATEGORIES[key]?.label || key, value: categories[key] || 0, color: CATEGORIES[key]?.color || 'var(--text-faint)' }))
    .filter((s) => s.value > 0)

  const spamCount = categories.spam || 0
  const hamCount = Math.max(0, summary.total - spamCount)

  return (
    <div className="h-full overflow-y-auto min-w-0" style={{ background: 'var(--bg-settings)', ...style }}>
      <Shell onBack={onBack}>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="Total emails" value={summary.total} />
          <StatCard label="Read" value={`${pct(summary.read, summary.total)}%`} hint={`${summary.read} read`} accent="#5B8DEF" />
          <StatCard label="Important" value={`${pct(summary.important, summary.total)}%`} hint={`${summary.important} flagged`} accent="#4ecf8e" />
          <StatCard label="Spam / ads" value={`${pct(spamCount, summary.total)}%`} hint={`${spamCount} filtered`} accent="#f0a030" />
        </div>

        {/* Category donut + breakdown bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* Donut */}
          <Panel title="Category distribution">
            {slices.length === 0 ? (
              <Empty label="No scanned emails yet. Run a scan to triage." />
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-3">
                <div style={{ width: 160, height: 160 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={slices}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {slices.map((s) => (
                          <Cell key={s.key} fill={s.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex flex-col gap-1 w-full min-w-0">
                  {slices.map((s) => (
                    <LegendRow key={s.key} color={s.color} label={s.label} value={s.value} total={summary.total} />
                  ))}
                </div>
              </div>
            )}
          </Panel>

          {/* Breakdown bars */}
          <Panel title="Breakdown">
            <BreakdownRow label="Read" value={summary.read} total={summary.total} color="#5B8DEF" />
            <BreakdownRow label="Unread" value={summary.unread} total={summary.total} color="var(--border-strong)" />
            <BreakdownRow label="Important" value={summary.important} total={summary.total} color="#4ecf8e" />
            <BreakdownRow label="Starred" value={summary.starred} total={summary.total} color="#f0a030" />
            <BreakdownRow label="Spam / ads" value={spamCount} total={summary.total} color="#f87171" />
            <BreakdownRow label="Legitimate" value={hamCount} total={summary.total} color="#7eaaff" />
          </Panel>
        </div>

        {/* 30-day trend */}
        <Panel title="Email volume · last 30 days">
          {trend.every((d) => d.count === 0) ? (
            <Empty label="No email activity in the last 30 days." />
          ) : (
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5B8DEF" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#5B8DEF" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--text-hint)' }}
                    tickFormatter={(d) => d.slice(5)}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--text-hint)' }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-reader)',
                      border: '0.5px solid var(--border-strong)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--text-label)',
                    }}
                    labelStyle={{ color: 'var(--text-hint)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#5B8DEF"
                    strokeWidth={1.5}
                    fill="url(#trendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </Shell>
    </div>
  )
}

function Shell({ onBack, children }) {
  return (
    <div className="px-3.5 py-3 space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={onBack}
          title="Back to inbox"
          aria-label="Back to inbox"
          className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center transition-colors"
          style={{ background: 'var(--surface-fill)', border: '0.5px solid var(--border-strong)', color: 'var(--text-sender)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-headline)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-sender)' }}
        >
          <BackIcon width={14} height={14} />
        </button>
        <h1 className="text-[14px] font-medium" style={{ color: 'var(--text-label)' }}>Dashboard</h1>
      </div>
      {children}
    </div>
  )
}

function StatCard({ label, value, hint, accent }) {
  return (
    <div
      className="rounded-lg px-3.5 py-3"
      style={{ background: 'var(--surface-fill-subtle)', border: '0.5px solid var(--border)' }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-hint)' }}>{label}</div>
      <div className="text-[22px] font-semibold mt-0.5" style={{ color: accent || 'var(--text-headline)' }}>{value}</div>
      {hint && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-dim)' }}>{hint}</div>}
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section
      className="rounded-lg px-3.5 py-3 space-y-2.5"
      style={{ background: 'var(--surface-fill-subtle)', border: '0.5px solid var(--border)' }}
    >
      <h2 className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {children}
    </section>
  )
}

function LegendRow({ color, label, value, total }) {
  const p = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span className="flex-1 truncate" style={{ color: 'var(--text-label)' }}>{label}</span>
      <span style={{ color: 'var(--text-dim)' }}>{value} · {p}%</span>
    </div>
  )
}

function BreakdownRow({ label, value, total, color }) {
  const p = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span style={{ color: 'var(--text-label)' }}>{label}</span>
        <span style={{ color: 'var(--text-dim)' }}>{value} ({Math.round(p)}%)</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-fill)' }}>
        <div className="h-full rounded-full" style={{ width: `${p}%`, background: color, minWidth: p > 0 ? 4 : 0 }} />
      </div>
    </div>
  )
}

function Empty({ label }) {
  return (
    <div className="text-[12px] py-4 text-center" style={{ color: 'var(--text-hint)' }}>{label}</div>
  )
}
