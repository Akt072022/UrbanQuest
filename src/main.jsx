import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initSupabaseSync } from './lib/syncSupabase'

// Wire Supabase auth + persistence to the zustand store. Safe to call
// when Supabase is not configured — it returns a no-op cleanup.
initSupabaseSync()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
