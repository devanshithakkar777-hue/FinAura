import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, TrendingUp, Brain, Shield, ArrowRight } from 'lucide-react';
import RiskQuiz from './RiskQuiz';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const PROFILE_INFO = {
  Conservative: {
    color:  'text-cyan-500',
    bg:     'bg-cyan-500/10',
    border: 'border-cyan-500/25',
    desc:   "You prefer capital preservation. We'll focus on bonds, index funds, and low-volatility assets with minimal crypto exposure.",
    icon:   Shield,
  },
  Moderate: {
    color:  'text-indigo-400',
    bg:     'bg-indigo-500/10',
    border: 'border-indigo-500/25',
    desc:   'Balanced growth with managed risk. A diversified mix of equities, mutual funds, and limited crypto exposure.',
    icon:   TrendingUp,
  },
  Aggressive: {
    color:  'text-amber-500',
    bg:     'bg-amber-500/10',
    border: 'border-amber-500/25',
    desc:   'High-growth focus with higher risk tolerance. Significant equity and crypto exposure for maximum long-term returns.',
    icon:   Brain,
  },
};

export default function OnboardingPage() {
  // onComplete is no longer needed as a prop — refreshProfile handles navigation
  const { user, refreshProfile } = useAuth();
  const [step, setStep]          = useState('welcome');
  const [profile, setProfile]    = useState(null);
  const [saving, setSaving]      = useState(false);

  const handleQuizResult = (result) => {
    setProfile(result);
    setStep('result');
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      if (user) {
        await updateDoc(doc(db, 'users', user.uid), { riskProfile: profile });
      }
    } catch {
      // Ignore if offline — user can update in Settings later
    }
    // Refresh profile in AuthContext; AppRoutes will re-render
    // and the onboarding guard will no longer match.
    await refreshProfile();
    setSaving(false);
  };

  const info = profile ? PROFILE_INFO[profile] : null;

  return (
    <div className="min-h-screen bg-[#080b14] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold">
            F
          </div>
          <span className="text-white font-bold text-xl">
            Fin<span className="text-indigo-400">Aura</span>
          </span>
        </div>

        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="text-center"
            >
              <h1 className="text-3xl font-bold text-white mb-3">
                Let's set up your profile
              </h1>
              <p className="text-slate-400 mb-8">
                Answer 4 quick questions so our AI can personalise your portfolio
                health scoring and recommendations.
              </p>
              <div className="grid grid-cols-3 gap-4 mb-10">
                {[
                  { icon: Brain,      label: 'AI Insights',    desc: 'Tailored to you' },
                  { icon: TrendingUp, label: 'Health Scoring', desc: 'Real-time analysis' },
                  { icon: Shield,     label: 'Risk Matching',  desc: 'Your comfort zone' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div
                    key={label}
                    className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.07] text-center"
                  >
                    <Icon size={20} className="text-indigo-400 mx-auto mb-2" />
                    <div className="text-xs font-semibold text-white">{label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{desc}</div>
                  </div>
                ))}
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setStep('quiz')}
                className="w-full"
              >
                Start Quiz <ArrowRight size={15} />
              </Button>
            </motion.div>
          )}

          {step === 'quiz' && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
            >
              <RiskQuiz onResult={handleQuizResult} />
            </motion.div>
          )}

          {step === 'result' && info && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center ${info.bg}`}
              >
                <CheckCircle size={28} className={info.color} />
              </motion.div>

              <h2 className="text-2xl font-bold text-white mb-2">
                You're a{' '}
                <span className={info.color}>{profile}</span> Investor
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
                {info.desc}
              </p>

              <div className={`p-4 rounded-xl border ${info.border} ${info.bg} mb-8 text-left`}>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  What this means for you:
                </div>
                <ul className="space-y-1.5 text-xs text-slate-400">
                  <li>• AI insights calibrated to your risk tolerance</li>
                  <li>
                    • Health score benchmarked against{' '}
                    {profile.toLowerCase()} investors
                  </li>
                  <li>• Rebalancing suggestions aligned to your profile</li>
                </ul>
              </div>

              <Button
                variant="primary"
                size="lg"
                onClick={handleFinish}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Enter FinAura <ArrowRight size={15} />
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
