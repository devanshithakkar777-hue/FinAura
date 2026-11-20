import { Suspense } from 'react'
import { Backdrop, Shell } from './components/Shell.jsx'
import { go, useAuth, useRoute } from './lib/hooks.jsx'
import { Forgot, Landing, Login, Register, Reset, Verify } from './pages/Auth.jsx'
import Behavior from './pages/Behavior.jsx'
import Check from './pages/Check.jsx'
import Council from './pages/Council.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Goals from './pages/Goals.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Portfolio from './pages/Portfolio.jsx'
import Rewards from './pages/Rewards.jsx'
import Settings from './pages/Settings.jsx'
import Twin from './pages/Twin.jsx'
import Intelligence from './pages/Intelligence.jsx'
import Wellness from './pages/Wellness.jsx'
import Wealth from './pages/Wealth.jsx'
import Plan from './pages/Plan.jsx'
import Wallet from './pages/Wallet.jsx'
import Tax from './pages/Tax.jsx'
import Credit from './pages/Credit.jsx'
import Assistant from './pages/Assistant.jsx'
import CoPilot from './pages/CoPilot.jsx'
import Family from './pages/Family.jsx'
import Learn from './pages/Learn.jsx'
import Advisor from './pages/Advisor.jsx'
import Explore from './pages/connect/Explore.jsx'
import Sessions from './pages/connect/Sessions.jsx'
import { Academy, Community } from './pages/connect/Learning.jsx'
import Expert from './pages/connect/Expert.jsx'

const PUBLIC = { '/': Landing, '/login': Login, '/register': Register, '/forgot': Forgot, '/reset': Reset }
const PRIVATE = { '/intelligence': Intelligence, '/wellness': Wellness, '/wealth': Wealth, '/plan': Plan, '/wallet': Wallet, '/tax': Tax, '/credit': Credit, '/assistant': Assistant, '/copilot': CoPilot, '/family': Family, '/estate': Family, '/learn': Learn, '/advisor': Advisor, '/connect': Explore, '/connect/sessions': Sessions, '/connect/academy': Academy, '/connect/community': Community, '/connect/expert': Expert, '/dashboard': Dashboard, '/check': Check, '/council': Council, '/twin': Twin, '/behavior': Behavior, '/portfolio': Portfolio, '/goals': Goals, '/rewards': Rewards, '/settings': Settings }

export default function App() {
  const { user, loading } = useAuth()
  const { path } = useRoute()
  if (loading) return <div className="grid min-h-screen place-items-center"><Backdrop /><span className="spinner" style={{ width: 28, height: 28 }} /></div>
  if (path === '/verify') return <Verify />
  if (!user) {
    const Page = PUBLIC[path]
    if (!Page) { queueMicrotask(() => go('/login')); return null }
    return <Page />
  }
  if (path === '/onboarding') return <Onboarding />
  if (!user.onboarded) { queueMicrotask(() => go('/onboarding')); return null }
  if (path === '/' || path === '/login' || path === '/register') { queueMicrotask(() => go('/dashboard')); return null }
  const Page = PRIVATE[path] ?? Dashboard
  return <Shell><Suspense fallback={null}><Page /></Suspense></Shell>
}
