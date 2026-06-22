import { useEffect, useState, useRef } from 'react'

/**
 * Floating scanning-progress pill rendered inside the reading pane.
 *
 * Props:
 *   running   — boolean, true while a scan is active
 *   progress  — { scanned, total } or null
 *   onCancel  — cancel callback
 */
export default function ScanProgressBar({ running, progress, onCancel }) {
  const [fading, setFading] = useState(false)
  const [show, setShow] = useState(false)
  const fadeTimer = useRef(null)

  // Show pill when running starts or progress exists
  useEffect(() => {
    if (running || (progress && progress.total > 0)) {
      setShow(true)
      setFading(false)
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    }
  }, [running, progress])

  // When scan completes, start 2.5s fade-out timer
  useEffect(() => {
    if (!running && progress && progress.total > 0) {
      fadeTimer.current = setTimeout(() => {
        setFading(true)
        // After fade animation (0.4s), hide completely
        setTimeout(() => setShow(false), 400)
      }, 2500)
    }
    return () => { if (fadeTimer.current) clearTimeout(fadeTimer.current) }
  }, [running, progress?.total])

  if (!show || !progress || !progress.total) return null

  const { scanned, total } = progress
  const completed = !running

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        right: 24,
        zIndex: 10,
        background: 'var(--bg-reader)',
        border: '0.5px solid var(--border-strong)',
        borderRadius: 999,
        padding: '6px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: 'var(--text-sender)',
        transition: 'opacity 0.4s ease',
        opacity: fading ? 0 : 1,
      }}
    >
      {/* Animated pulsing dot */}
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: completed ? '#4ecf8e' : '#f0a030',
          animation: completed ? 'none' : 'pulse 1.2s ease-in-out infinite',
          flexShrink: 0,
        }}
      />

      {/* Label text */}
      <span style={{ fontSize: 12, color: 'var(--text-body)' }}>
        {completed ? 'Relevance scores ready' : 'Scanning relevance scores'}
      </span>

      {/* Progress count */}
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-headline)' }}>
        {scanned}/{total}
      </span>

      {/* Cancel button — only while running */}
      {running && (
        <span
          onClick={(e) => { e.stopPropagation(); onCancel?.() }}
          style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            cursor: 'pointer',
            border: 'none',
            background: 'none',
            padding: 0,
            lineHeight: 'inherit',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-sender)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
        >
          × Cancel
        </span>
      )}
    </div>
  )
}
