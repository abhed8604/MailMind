/**
 * Debounced search box. Reports the trimmed query up via onChange; the parent
 * feeds it into useEmails. Empty value clears the filter.
 */
export default function SearchBar({ value, onChange, placeholder = 'Search sender, subject, content…' }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-sm">🔍</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-ink-900 border border-ink-800 rounded-md pl-9 pr-3 py-2 text-sm text-ink-200 placeholder-ink-400 focus:outline-none focus:border-ink-600"
      />
    </div>
  )
}
