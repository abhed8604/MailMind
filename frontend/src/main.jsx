import React from 'react'
import ReactDOM from 'react-dom/client'
// Self-hosted Geist (replaces the previously-declared-but-never-loaded "Inter").
// Skill §4.1 / §3.A: never link Google Fonts via <link>; self-host with font-display: swap.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
