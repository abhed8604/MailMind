/**
 * Fixed bottom scan-progress bar.
 *
 * Spans the full width of the app, pinned just above the bottom edge. Shows
 * live triage progress (scanned / total), a liquid-glass fill, and a Cancel
 * button that stops the scan after the current batch. Only rendered while a
 * scan is running.
 */
export default function ScanProgressBar({ progress, onCancel }) {
  if (!progress || !progress.total) return null
  const pct = Math.min(100, Math.round((progress.scanned / progress.total) * 100))

  return (
    <div
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 glass rounded-full pl-4 pr-2 py-1.5"
      style={{
        minWidth: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 40px rgba(124,110,249,0.10)',
      }}
    >
      {/* Animated scanning glyph */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: '#f59e0b' }} />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: '#f59e0b' }} />
      </span>

      {/* Label */}
      <span className="text-[12px] text-white/70 font-medium whitespace-nowrap shrink-0">
        Scanning
      </span>

      {/* Progress track + fill */}
      <div
        className="relative h-1.5 rounded-full overflow-hidden shrink-0"
        style={{ width: 120, background: 'rgba(255,255,255,0.08)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #f59e0b, #7c6ef9)',
          }}
        />
      </div>

      {/* Count */}
      <span className="text-[11px] text-white/45 font-mono whitespace-nowrap shrink-0">
        {progress.scanned}/{progress.total}
      </span>

      {/* Cancel */}
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors"
        style={{
          color: '#fca5a5',
          border: '0.5px solid rgba(248,113,113,0.25)',
        }}
        title="Stop after current batch"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
        </svg>
        Cancel
      </button>
    </div>
  )
}
