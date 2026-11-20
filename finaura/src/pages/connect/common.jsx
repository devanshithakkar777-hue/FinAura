import { BadgeCheck, ShieldCheck } from 'lucide-react'
import { Chip } from '../../components/ui.jsx'

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const KIND_LABEL = { chat: 'Chat', audio: 'Audio call', video: 'Video call', callback: 'Callback', second_opinion: 'Second opinion' }
export const STATUS_TONE = { requested: 'warn', confirmed: 'info', completed: 'good', cancelled: undefined, declined: undefined, pending: 'warn', verified: 'good', rejected: 'bad', suspended: 'bad' }
export const SHARE_SCOPES = [['profile', 'Age, retirement age & dependents'], ['netWorth', 'Net worth'], ['wellness', 'Wellness score'], ['behaviour', 'Behaviour flags'], ['plan', 'Retirement readiness'], ['allocation', 'Asset allocation'], ['documents', 'Documents I upload here']]

export const TierChip = ({ trust }) => trust ? <Chip tone={trust.tier === 'trusted' ? 'good' : trust.tier === 'established' ? 'info' : 'warn'}><ShieldCheck size={12} />Trust {trust.score} · {trust.tier}</Chip> : null
export const Verified = () => <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--gold)' }}><BadgeCheck size={14} />Verified</span>
export const availText = a => (a ?? []).map(s => `${DAYS[s.day]} ${s.start}–${s.end}`).join(' · ') || 'By request'
export const when = iso => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')
