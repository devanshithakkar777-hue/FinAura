export const LEVEL_THRESHOLDS = [0, 500, 1500, 3000, 5500, 9000, 13500, 19500, 27000, 36000];
export const LEVEL_NAMES = ['', 'Beginner', 'Learner', 'Saver', 'Investor', 'Trader', 'Analyst', 'Strategist', 'Expert', 'Pro', 'Legend'];

export function levelFromXP(xp) {
  let level = 1;
  LEVEL_THRESHOLDS.forEach((t, i) => { if (xp >= t) level = i + 1; });
  return { level, name: LEVEL_NAMES[level], prev: LEVEL_THRESHOLDS[level - 1], next: LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] };
}

/** Points per event. `ref` makes an award idempotent (e.g. one per transaction, one per month). */
export const XP_RULES = {
  log_trade:        { points: 20,  label: 'Logged a trade' },
  import_trades:    { points: 100, label: 'Imported your history' },
  premortem_done:   { points: 40,  label: 'Ran a pre-mortem check' },
  premortem_waited: { points: 150, label: 'Paused a high-risk trade' },
  council_run:      { points: 30,  label: 'Consulted the council' },
  goal_created:     { points: 80,  label: 'Set a goal' },
  sip_month:        { points: 120, label: 'Invested in a new month' },
  daily_checkin:    { points: 10,  label: 'Daily check-in' },
  onboarding:       { points: 100, label: 'Completed your risk profile' },
};

export const ACHIEVEMENTS = [
  { key: 'first_trade',   title: 'First Step',      desc: 'Log your first trade',                          test: c => c.txnCount >= 1 },
  { key: 'ten_trades',    title: 'Getting Serious', desc: 'Log 10 trades',                                 test: c => c.txnCount >= 10 },
  { key: 'premortem_pro', title: 'Pre-mortem Pro',  desc: 'Resolve 5 pre-mortem checks',                   test: c => c.resolvedNudges >= 5 },
  { key: 'steady_hands',  title: 'Steady Hands',    desc: 'Pause a high-risk trade instead of acting',     test: c => c.waitedHighRisk >= 1 },
  { key: 'sip_streak_3',  title: 'Habit Builder',   desc: 'Invest in 3 different months',                  test: c => c.investMonths >= 3 },
  { key: 'diversified',   title: 'Spread Wide',     desc: 'Hold 4 or more asset classes',                  test: c => c.classCount >= 4 },
  { key: 'goal_setter',   title: 'Goal Setter',     desc: 'Create a financial goal',                       test: c => c.goalCount >= 1 },
  { key: 'council_reg',   title: 'Wise Counsel',    desc: 'Consult the council 3 times',                   test: c => c.councilCount >= 3 },
  { key: 'week_streak',   title: 'Week Warrior',    desc: 'Check in 7 days in a row',                      test: c => c.streakDays >= 7 },
  { key: 'calm_quarter',  title: 'Calm Quarter',    desc: 'No panic sells in 90 days (with 5+ trades)',    test: c => c.txnCount >= 5 && c.panicSells90 === 0 },
];
