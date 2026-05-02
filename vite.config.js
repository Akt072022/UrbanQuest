import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// On GitHub Pages the site is served at https://<user>.github.io/<repo>/,
// so all asset URLs need the repo prefix. Locally (dev) it stays at "/".
// The deploy workflow exports VITE_BASE_PATH=/<repo>/ before `vite build`.
//
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
})
