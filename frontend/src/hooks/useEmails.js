import { useCallback, useEffect, useRef, useState } from 'react'
import { getEmails, patchEmail } from '../api/client'

/**
 * Fetches the unified inbox with filtering / search / pagination, and exposes
 * optimistic read-state + star toggles that also fire the backend patch.
 *
 * ``refreshKey`` is an opaque counter that, when changed, forces a re-fetch —
 * used to pull fresh AI summaries after a triage scan completes.
 */
export function useEmails({ filter, q, account, page, refreshKey }) {
  const [data, setData] = useState({ emails: [], total: 0, total_pages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const reqId = useRef(0)

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    const params = { filter, page }
    if (q) params.q = q
    if (account != null) params.account_id = account
    getEmails(params)
      .then((res) => {
        if (id !== reqId.current) return // stale response
        setData(res)
        setError(null)
      })
      .catch((e) => id === reqId.current && setError(e.message || String(e)))
      .finally(() => id === reqId.current && setLoading(false))
  }, [filter, q, account, page, refreshKey])

  const updateOne = useCallback((id, updater) => {
    setData((d) => ({
      ...d,
      emails: d.emails.map((e) => (e.id === id ? updater(e) : e)),
    }))
  }, [])

  const toggleRead = useCallback(async (email) => {
    const next = !email.is_read
    updateOne(email.id, (e) => ({ ...e, is_read: next }))
    try {
      await patchEmail(email.id, { is_read: next })
    } catch {
      updateOne(email.id, (e) => ({ ...e, is_read: !next })) // rollback
    }
  }, [updateOne])

  const toggleStar = useCallback(async (email) => {
    const next = !email.is_starred
    updateOne(email.id, (e) => ({ ...e, is_starred: next }))
    try {
      await patchEmail(email.id, { is_starred: next })
    } catch {
      updateOne(email.id, (e) => ({ ...e, is_starred: !next }))
    }
  }, [updateOne])

  const markReadLocally = useCallback((id) => {
    updateOne(id, (e) => ({ ...e, is_read: true }))
  }, [updateOne])

  return { data, loading, error, toggleRead, toggleStar, markReadLocally, setData }
}
