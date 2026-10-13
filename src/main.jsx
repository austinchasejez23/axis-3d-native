import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Follow the device's system dark/light setting. This is browser-wide state,
// so it does not need a React hook or component lifecycle.
const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
const applyColorScheme = () => document.documentElement.classList.toggle('dark', colorScheme.matches)
applyColorScheme()
colorScheme.addEventListener('change', applyColorScheme)
if (import.meta.hot) import.meta.hot.dispose(() => colorScheme.removeEventListener('change', applyColorScheme))

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)