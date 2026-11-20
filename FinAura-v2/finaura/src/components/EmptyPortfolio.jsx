import { useState } from 'react'
import { Database, Plus } from 'lucide-react'
import { Button, Empty } from './ui.jsx'
import { api, errorMessage } from '../lib/api.js'
import { go, useAuth, useToasts } from '../lib/hooks.jsx'

export function EmptyPortfolio({ what = 'insights' }) {
  const { invalidate, refresh } = useAuth(); const { push } = useToasts(); const [busy, setBusy] = useState(false)
  const load = async () => {
    setBusy(true)
    try { const r = await api.post('/demo'); invalidate(); refresh(); push({ kind: 'success', title: 'Demo portfolio loaded', text: `${r.loaded} synthetic trades added. Delete them any time from Portfolio.` }) }
    catch (e) { push({ kind: 'error', text: errorMessage(e) }) } finally { setBusy(false) }
  }
  return (
    <Empty title="Add some trades to unlock this" body={`Your ${what} are built from your own transactions. Log a few, import a CSV, or explore with a clearly-labelled synthetic demo portfolio.`}
      action={<div className="mt-1 flex flex-wrap justify-center gap-2"><Button variant="primary" loading={busy} onClick={load}><Database size={16} />Load demo data</Button><Button onClick={() => go('/portfolio')}><Plus size={16} />Add trades</Button></div>} />
  )
}
