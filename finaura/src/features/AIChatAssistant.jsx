import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { Brain, Send, RefreshCw, TrendingUp, Shield, AlertTriangle, BarChart3, Sparkles } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button, IconButton } from '../components/ui/Button';
import { getAIResponse } from '../services/advisoryEngine';
import { useAuth } from '../context/AuthContext';

const BEHAVIOR = [
  { trait: 'Patience',   score: 72 },
  { trait: 'Discipline', score: 65 },
  { trait: 'Risk Mgmt',  score: 80 },
  { trait: 'Consistency',score: 58 },
  { trait: 'Research',   score: 88 },
  { trait: 'Diversif.',  score: 74 },
];

const RADAR_DATA = BEHAVIOR.map(b => ({
  subject: b.trait,
  A: b.score,
  fullMark: 100,
}));

const SUGGESTIONS = [
  'Why did my portfolio drop last week?',
  'Should I increase my crypto allocation?',
  'How can I improve my behavior score?',
  'What is my biggest risk right now?',
];

export default function AIChatAssistant() {
  const { user, profile } = useAuth();

  // Derive first name from profile/displayName for personalised greeting
  const firstName = useMemo(() => {
    const full = profile?.name || user?.displayName || 'Investor';
    return full.split(' ')[0];
  }, [profile, user]);

  const initMsg = useMemo(() => ({
    role: 'ai',
    text: `Hi ${firstName}! I've analyzed your portfolio and behavioral patterns. Ask me anything about your investments, or tap a suggestion below.`,
  }), [firstName]);

  const [messages, setMessages] = useState([initMsg]);
  const [input, setInput]       = useState('');
  const [typing, setTyping]     = useState(false);
  const bottomRef               = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  // When the user's name loads, update the initial greeting if it's still the first message
  useEffect(() => {
    setMessages([initMsg]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initMsg]);

  const send = (text) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(prev => [...prev, { role: 'ai', text: getAIResponse(msg) }]);
    }, 900 + Math.random() * 700);
  };

  const resetChat = () => setMessages([initMsg]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
      {/* Left: behavior panel */}
      <div className="lg:col-span-2 space-y-4">
        <Card animate delay={0} className="p-5">
          <CardHeader
            title="Behavior Profile"
            subtitle="AI-assessed investing traits"
            action={<Badge variant="purple">74 / 100</Badge>}
          />
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={RADAR_DATA}>
                <PolarGrid stroke="rgba(148,163,184,0.12)" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <Radar
                  name="Score"
                  dataKey="A"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  dot={{ fill: '#6366f1', r: 3 }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2.5 mt-2">
            {BEHAVIOR.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 dark:text-slate-300 w-24 shrink-0">
                  {b.trait}
                </span>
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${b.score}%` }}
                    transition={{ duration: 0.8, delay: 0.3 + i * 0.05 }}
                    className="h-full rounded-full"
                    style={{
                      background: b.score >= 75 ? '#22c55e'
                        : b.score >= 60 ? '#6366f1'
                        : '#f59e0b',
                    }}
                  />
                </div>
                <span
                  className={`text-xs font-semibold w-7 text-right ${
                    b.score >= 75 ? 'text-emerald-500'
                      : b.score >= 60 ? 'text-indigo-400'
                      : 'text-amber-500'
                  }`}
                >
                  {b.score}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card animate delay={0.05} className="p-5">
          <CardHeader title="Detected Patterns" subtitle="Based on 12 months of activity" />
          <div className="space-y-3">
            {[
              { icon: AlertTriangle, color: 'text-amber-500',  bg: 'bg-amber-500/10',  label: 'Panic Selling',   desc: '3 of last 4 dips', badge: 'amber',  bl: 'Warning'   },
              { icon: TrendingUp,   color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'SIP Consistency', desc: '10 of 12 months',  badge: 'green',  bl: 'Good'      },
              { icon: Shield,       color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  label: 'Diversification', desc: 'Improving trend',  badge: 'purple', bl: 'Improving' },
              { icon: BarChart3,    color: 'text-blue-400',    bg: 'bg-blue-500/10',    label: 'Research Depth',  desc: 'Above average',   badge: 'blue',   bl: 'Strong'    },
            ].map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl ${p.bg} ${p.color} flex items-center justify-center shrink-0`}>
                  <p.icon size={14} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{p.label}</div>
                  <div className="text-xs text-slate-400">{p.desc}</div>
                </div>
                <Badge variant={p.badge}>{p.bl}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Right: chat */}
      <Card animate delay={0.1} className="lg:col-span-3 p-5 flex flex-col" style={{ height: 640 }}>
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <Brain size={17} className="text-indigo-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">FinAura AI</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Online · Analyzing your portfolio
              </div>
            </div>
          </div>
          <IconButton onClick={resetChat} aria-label="Reset chat">
            <RefreshCw size={13} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {m.role === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={12} className="text-indigo-400" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    m.role === 'ai'
                      ? 'bg-slate-100 dark:bg-white/[0.06] text-slate-800 dark:text-slate-200 rounded-tl-sm'
                      : 'bg-indigo-500 text-white rounded-tr-sm'
                  }`}
                >
                  {m.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {typing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2.5"
            >
              <div className="w-7 h-7 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0">
                <Sparkles size={12} className="text-indigo-400" />
              </div>
              <div className="bg-slate-100 dark:bg-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
                {[0, 1, 2].map(d => (
                  <span
                    key={d}
                    className="typing-dot w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block"
                    style={{ animationDelay: `${d * 0.15}s` }}
                  />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestion chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              className="text-[11px] px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:border-indigo-500/40 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all font-medium"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask about your portfolio..."
            className="flex-1 bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          <Button variant="primary" onClick={() => send()} aria-label="Send">
            <Send size={14} />
          </Button>
        </div>
      </Card>
    </div>
  );
}
