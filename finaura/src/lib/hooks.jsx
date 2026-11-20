import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, setUnauthorizedHandler, errorMessage } from './api.js'
import { makeMoney } from './format.js'

/* ── Hash router ─────────────────────────────────────────────── */
export function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  return { path: path || '/', params: Object.fromEntries(new URLSearchParams(query)) }
}
export function useRoute() {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
export const go = path => { window.location.hash = path }

/* ── Theme ───────────────────────────────────────────────────── */
const ThemeCtx = createContext(null)
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { const t = localStorage.getItem('finaura-theme'); if (t) return t } catch { /* ignore */ }
    return 'dark'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('finaura-theme', theme) } catch { /* ignore */ }
  }, [theme])
  const value = useMemo(() => ({ theme, toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) }), [theme])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}
export const useTheme = () => useContext(ThemeCtx)

/* ── Toasts ──────────────────────────────────────────────────── */
const ToastCtx = createContext(null)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const idRef = useRef(0)
  const push = useCallback((t) => {
    const id = ++idRef.current
    setItems(xs => [...xs.slice(-3), { id, kind: 'info', ...(typeof t === 'string' ? { text: t } : t) }])
    setTimeout(() => setItems(xs => xs.filter(x => x.id !== id)), t.ttl ?? 4200)
  }, [])
  const value = useMemo(() => ({ push, items, dismiss: id => setItems(xs => xs.filter(x => x.id !== id)) }), [push, items])
  return <ToastCtx.Provider value={value}>{children}</ToastCtx.Provider>
}
export const useToasts = () => useContext(ToastCtx)

/* ── Auth ────────────────────────────────────────────────────── */
const AuthCtx = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0) // bump to refetch data after mutations

  const refresh = useCallback(async () => {
    try { const r = await api.get('/me'); setUser(r.user); return r.user } catch { setUser(null); return null }
  }, [])

  useEffect(() => {
    let off = false
    api.get('/me').then(r => { if (!off) setUser(r.user) }).catch(() => { if (!off) setUser(null) }).finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
  }, [])
  useEffect(() => { setUnauthorizedHandler(() => setUser(null)) }, [])

  const value = useMemo(() => ({
    user, loading, version,
    money: makeMoney(user?.currency ?? 'INR'),
    refresh,
    invalidate: () => setVersion(v => v + 1),
    async login(email, password) { const r = await api.post('/auth/login', { email, password }); setUser(r.user); return r.user },
    async register(body) { const r = await api.post('/auth/register', body); setUser(r.user); return r.user },
    async logout() { try { await api.post('/auth/logout') } finally { setUser(null); go('/') } },
    setUser,
  }), [user, loading, version, refresh])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
export const useAuth = () => useContext(AuthCtx)

/* ── Data fetching ───────────────────────────────────────────── */
export function useApi(path, { enabled = true } = {}) {
  const { version } = useAuth()
  const [tick, setTick] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const key = enabled && path ? `${path}|${version}|${tick}` : null
  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    api.get(path)
      .then(data => { if (!cancelled) setState({ key, data, error: null }) })
      .catch(error => { if (!cancelled) setState(s => ({ key, data: s.data, error })) })
    return () => { cancelled = true }
  }, [key, path])
  const loading = key !== null && state.key !== key
  const error = state.key === key ? state.error : null
  return { data: state.data, error, loading, message: error ? errorMessage(error) : null, reload: () => setTick(t => t + 1) }
}

/* ── Pointer spotlight for glass cards ───────────────────────── */
export function spotlight(e) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export function useCountUp(target, { duration = 900, enabled = true } = {}) {
  const [anim, setAnim] = useState(0)
  const from = useRef(0)
  const active = enabled && Number.isFinite(target)
  useEffect(() => {
    if (!active) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { from.current = target; return undefined }
    const start = performance.now(), a = from.current
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      setAnim(a + (target - a) * (1 - Math.pow(1 - t, 4)))
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, active])
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return !active || reduced ? target : anim
}
