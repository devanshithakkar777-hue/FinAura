import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.jsx'
import { AuthProvider, ThemeProvider, ToastProvider } from './lib/hooks.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></ThemeProvider>
  </StrictMode>,
)
