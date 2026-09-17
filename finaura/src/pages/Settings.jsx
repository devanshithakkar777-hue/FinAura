import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogOut, Moon, Sun } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Settings() {
  const { user, profile, logout } = useAuth();
  const { dark, toggle }          = useTheme();
  const [risk, setRisk]           = useState(profile?.riskProfile || 'Moderate');
  const [notifs, setNotifs]       = useState({ ai: true, price: true, weekly: false });

  const displayName = profile?.name || user?.displayName || 'Investor';

  return (
    <div className="space-y-4 page-enter max-w-2xl">
      {/* Profile */}
      <Card animate delay={0} className="p-5">
        <CardHeader title="Profile" subtitle="Your account information" />
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xl font-bold">
            {displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-white">{displayName}</div>
            <div className="text-sm text-slate-400">{user?.email || 'demo@finaura.app'}</div>
            <Badge variant="purple" className="mt-1">Pro Investor</Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Full Name', value: displayName },
            { label: 'Email',     value: user?.email || 'demo@finaura.app' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">{f.label}</label>
              <input
                defaultValue={f.value}
                className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
          ))}
        </div>
        <Button variant="primary" size="sm" className="mt-4">Save Changes</Button>
      </Card>

      {/* Risk Profile */}
      <Card animate delay={0.05} className="p-5">
        <CardHeader title="Risk Profile" subtitle="Affects AI recommendations and health scoring" />
        <div className="grid grid-cols-3 gap-3">
          {['Conservative', 'Moderate', 'Aggressive'].map(r => (
            <button key={r} onClick={() => setRisk(r)}
              className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                risk === r
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                  : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/[0.12]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </Card>

      {/* Appearance */}
      <Card animate delay={0.1} className="p-5">
        <CardHeader title="Appearance" subtitle="Customize your experience" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {dark ? <Moon size={16} className="text-indigo-400" /> : <Sun size={16} className="text-amber-400" />}
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-white">
                {dark ? 'Dark Mode' : 'Light Mode'}
              </div>
              <div className="text-xs text-slate-400">Currently using {dark ? 'dark' : 'light'} theme</div>
            </div>
          </div>
          <button
            onClick={toggle}
            className={`relative w-11 h-6 rounded-full transition-colors ${dark ? 'bg-indigo-500' : 'bg-slate-200'}`}
          >
            <motion.div
              animate={{ x: dark ? 20 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
            />
          </button>
        </div>
      </Card>

      {/* Notifications */}
      <Card animate delay={0.15} className="p-5">
        <CardHeader title="Notifications" subtitle="Choose what alerts you receive" />
        <div className="space-y-3">
          {[
            { key: 'ai',     label: 'AI Insights',    desc: 'Behavioral alerts and recommendations' },
            { key: 'price',  label: 'Price Alerts',   desc: 'Significant market movements' },
            { key: 'weekly', label: 'Weekly Summary', desc: 'Portfolio performance digest' },
          ].map(n => (
            <div key={n.key} className="flex items-center justify-between py-1">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">{n.label}</div>
                <div className="text-xs text-slate-400">{n.desc}</div>
              </div>
              <button
                onClick={() => setNotifs(prev => ({ ...prev, [n.key]: !prev[n.key] }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  notifs[n.key] ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-white/[0.1]'
                }`}
              >
                <motion.div
                  animate={{ x: notifs[n.key] ? 20 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Danger zone */}
      <Card animate delay={0.2} className="p-5">
        <CardHeader title="Account" />
        <Button variant="danger" onClick={logout}><LogOut size={14} /> Sign Out</Button>
      </Card>
    </div>
  );
}
