import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

const QUESTIONS = [
  {
    q: 'How would you react if your portfolio dropped 20% in a month?',
    options: [
      { label: 'Sell everything immediately',     score: 1 },
      { label: 'Sell some to reduce exposure',    score: 2 },
      { label: 'Hold and wait for recovery',      score: 3 },
      { label: "Buy more — it's a discount",      score: 4 },
    ],
  },
  {
    q: 'What is your primary investment goal?',
    options: [
      { label: 'Preserve capital, minimal risk',  score: 1 },
      { label: 'Steady growth over 5–10 years',   score: 2 },
      { label: 'Aggressive growth, high risk OK',  score: 3 },
      { label: 'Speculative gains, crypto-heavy',  score: 4 },
    ],
  },
  {
    q: 'How long can you leave your money invested?',
    options: [
      { label: 'Less than 1 year',                score: 1 },
      { label: '1–3 years',                       score: 2 },
      { label: '3–7 years',                       score: 3 },
      { label: '7+ years',                        score: 4 },
    ],
  },
  {
    q: 'What percentage of your savings are you investing?',
    options: [
      { label: 'Less than 10%',                   score: 1 },
      { label: '10–30%',                          score: 2 },
      { label: '30–60%',                          score: 3 },
      { label: 'More than 60%',                   score: 4 },
    ],
  },
];

/**
 * Score range: min 4 (all 1s), max 16 (all 4s).
 *
 * Conservative : 4–7   (very risk-averse across all questions)
 * Moderate     : 8–12  (balanced responses)
 * Aggressive   : 13–16 (consistently high-risk choices)
 */
function scoreToProfile(total) {
  if (total <= 7)  return 'Conservative';
  if (total <= 12) return 'Moderate';
  return 'Aggressive';
}

export default function RiskQuiz({ onResult }) {
  const [step, setStep]         = useState(0);
  const [answers, setAnswers]   = useState([]);
  const [selected, setSelected] = useState(null);

  const current = QUESTIONS[step];
  const isLast  = step === QUESTIONS.length - 1;

  const next = () => {
    if (selected === null) return;
    const newAnswers = [...answers, selected];
    if (isLast) {
      const total = newAnswers.reduce((s, a) => s + a, 0);
      onResult(scoreToProfile(total));
    } else {
      setAnswers(newAnswers);
      setStep(s => s + 1);
      setSelected(null);
    }
  };

  const back = () => {
    if (step === 0) return;
    setStep(s => s - 1);
    setAnswers(a => a.slice(0, -1));
    setSelected(null);
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="flex gap-1.5 mb-8">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full transition-all duration-300 ${
              i <= step
                ? 'bg-indigo-500'
                : 'bg-slate-200 dark:bg-white/[0.08]'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">
            Question {step + 1} of {QUESTIONS.length}
          </p>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 leading-snug">
            {current.q}
          </h3>

          <div className="space-y-3">
            {current.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => setSelected(opt.score)}
                className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition-all ${
                  selected === opt.score
                    ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-600 dark:text-indigo-400'
                    : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.07] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/[0.14]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <Button variant="ghost" onClick={back}>
            <ChevronLeft size={14} /> Back
          </Button>
        )}
        <Button
          variant="primary"
          onClick={next}
          disabled={selected === null}
          className="flex-1"
        >
          {isLast ? 'See My Profile' : 'Next'} <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
