import { maxCryptoFor } from './health.js';
import { diffDays } from '../lib/dates.js';

const VALUE = { support: 1, neutral: 0, oppose: -1 };
const WEIGHT = { risk: 1.2, behavior: 1.0, tax: 0.7, goals: 1.0 };
const fmt = n => Math.round(n).toLocaleString();
const pct = n => `${Math.round(n * 100)}%`;

/** Turn a free-text question into a topic: { action: 'sell'|'buy'|'rebalance', symbol? }. */
export function parseQuestion(question, positions, knownSymbols = []) {
  const q = (question ?? '').toLowerCase();
  const symbols = new Set([...positions.map(p => p.symbol), ...knownSymbols]);
  let symbol = null;
  for (const s of symbols) {
    if (new RegExp(`\\b${s.toLowerCase().replace(/[^a-z0-9]/g, '')}\\b`).test(q.replace(/[^a-z0-9\s]/g, ''))) { symbol = s; break; }
  }
  const action = /\b(sell|exit|dump|cash out|reduce|trim)\b/.test(q) ? 'sell'
    : /\b(buy|add|increase|invest|load up|accumulate)\b/.test(q) ? 'buy' : 'rebalance';
  return { action, symbol };
}

function riskAgent(ctx, topic) {
  const { positions, allocation, riskProfile, health, rsi } = ctx;
  const crypto = allocation.find(a => a.assetClass === 'crypto')?.weight ?? 0;
  const maxC = maxCryptoFor(riskProfile);
  const reasons = [], actions = [];
  let stance = 'neutral';
  const pos = topic.symbol ? positions.find(p => p.symbol === topic.symbol) : null;
  const breach = crypto > maxC;
  if (breach) reasons.push(`Crypto is ${pct(crypto)} of your portfolio vs a ${pct(maxC)} guideline for ${riskProfile}.`);
  const top = positions[0];
  if (top && top.weight > 0.4) reasons.push(`${top.symbol} alone is ${pct(top.weight)} of your portfolio.`);
  if (health.avgRsi > 70) reasons.push(`Holdings look overbought (weighted RSI ${health.avgRsi}).`);

  if (topic.action === 'sell') {
    if (pos && (pos.weight > 0.25 || (pos.assetClass === 'crypto' && breach) || (rsi.get(pos.symbol) ?? 50) > 75)) {
      stance = 'support'; reasons.push(`${pos.symbol} is ${pct(pos.weight)} of the portfolio, so trimming would lower concentration.`);
      actions.push(`Consider trimming in stages rather than all at once.`);
    } else if (pos) {
      stance = 'oppose'; reasons.push(`${pos.symbol} is only ${pct(pos.weight)} of your portfolio and no risk limit is breached, so selling does little for risk.`);
    }
  } else if (topic.action === 'buy') {
    const asset = pos ?? null;
    if ((asset?.assetClass === 'crypto' && crypto >= maxC) || (asset && asset.weight > 0.3)) {
      stance = 'oppose'; reasons.push('Adding more would push you further past your own risk guidelines.');
    } else if (health.diversification < 60) {
      stance = 'support'; reasons.push('Your diversification score is low, so broadening exposure helps.');
    }
  } else if (breach || (top && top.weight > 0.4)) {
    stance = 'support';
    if (breach) actions.push(`Move about ${fmt((crypto - maxC) * ctx.total)} out of crypto into lower-volatility assets to get back inside your guideline.`);
    if (top && top.weight > 0.4) actions.push(`Reduce ${top.symbol} toward 35% of the portfolio.`);
  } else {
    reasons.push('No risk limit is currently breached.');
  }
  return { id: 'risk', name: 'Risk Officer', role: 'Limits, concentration and volatility', stance, confidence: Math.min(0.95, 0.5 + reasons.length * 0.12), headline: stance === 'support' ? 'Risk data supports acting.' : stance === 'oppose' ? 'Risk data does not support this.' : 'Risk is within bounds.', reasons, actions };
}

function behaviorAgent(ctx, topic) {
  const { behavior, premortem } = ctx;
  const reasons = [], actions = [];
  let stance = 'neutral';
  if (behavior.status !== 'ok') {
    return { id: 'behavior', name: 'Behavior Coach', role: 'Your habits and biases', stance: 'neutral', confidence: 0.3, headline: 'Not enough history yet.', reasons: ['Log a few more trades to unlock personal pattern analysis.'], actions: [] };
  }
  const { evidence, traits } = behavior;
  if (topic.action === 'sell' && premortem) {
    if (premortem.riskLevel === 'high') { stance = 'oppose'; reasons.push(premortem.headline); premortem.signals.slice(0, 3).forEach(s => reasons.push(s.detail)); actions.push('Take the 24-hour cooling-off before deciding.'); }
    else if (premortem.riskLevel === 'low') { stance = 'support'; reasons.push('Market conditions are calm, so this does not look like a reaction to a drop.'); }
    else { reasons.push(premortem.headline); }
  } else if (topic.action === 'buy' && premortem) {
    if (premortem.riskLevel === 'high') { stance = 'oppose'; reasons.push(premortem.headline); premortem.signals.slice(0, 3).forEach(s => reasons.push(s.detail)); actions.push('Split the purchase across 3 months instead of buying at once.'); }
    else if (evidence.sipSymbols.length) { stance = 'support'; reasons.push('You invest well when you do it systematically; a staged buy fits that habit.'); }
  } else {
    if (evidence.panicSells >= 1) reasons.push(`${evidence.panicSells} of your past sells followed sharp drops — rules-based rebalancing protects you from improvising.`);
    if (traits.discipline < 70) reasons.push('Your discipline score is below 70; a written rebalancing rule would help.');
    if (reasons.length) { stance = 'support'; actions.push('Rebalance on a fixed schedule (e.g. quarterly), not after market moves.'); }
    else reasons.push('Your behaviour profile shows no red flags for a planned rebalance.');
  }
  return { id: 'behavior', name: 'Behavior Coach', role: 'Your habits and biases', stance, confidence: Math.min(0.95, 0.55 + reasons.length * 0.1), headline: stance === 'oppose' ? 'This looks emotional, not planned.' : stance === 'support' ? 'This fits your good habits.' : 'Nothing behavioural stands out.', reasons, actions };
}

function taxAgent(ctx, topic) {
  const { positions } = ctx;
  const reasons = [], actions = [];
  let stance = 'neutral';
  const pos = topic.symbol ? positions.find(p => p.symbol === topic.symbol) : null;
  if (topic.action === 'sell' && pos) {
    if (pos.unrealised < 0) { stance = 'support'; reasons.push(`${pos.symbol} is at an unrealised loss of ${fmt(-pos.unrealised)}, which could offset gains elsewhere.`); }
    else if (pos.oldestLotDays < 365 && pos.oldestLotDays >= 305) {
      stance = 'oppose'; reasons.push(`Your oldest ${pos.symbol} lot is ${pos.oldestLotDays} days old; waiting ~${365 - pos.oldestLotDays} days may change how the gain is classified.`);
      actions.push('Check the long-term holding threshold for this asset type before selling.');
    } else if (pos.unrealised > 0) { reasons.push(`Selling would realise roughly ${fmt(pos.unrealised)} of gains.`); }
  } else if (topic.action === 'rebalance') {
    const winners = positions.filter(p => p.unrealised > 0 && p.weight > 0.3);
    if (winners.length) { reasons.push(`Trimming ${winners.map(w => w.symbol).join(', ')} would realise gains; consider rebalancing with new contributions first.`); actions.push('Direct new money to underweight assets before selling winners.'); }
    else reasons.push('Rebalancing here would realise little tax.');
  } else reasons.push('No tax-specific concerns for buying.');
  reasons.push('Tax rules vary by asset, holding period and jurisdiction — treat this as a prompt to check, not as tax advice.');
  return { id: 'tax', name: 'Tax Analyst', role: 'Holding periods and realised gains', stance, confidence: 0.55, headline: stance === 'oppose' ? 'Timing could cost you tax.' : stance === 'support' ? 'Tax angle is favourable.' : 'No strong tax signal.', reasons, actions };
}

const RETURN_BY_PROFILE = { Conservative: 0.06, Moderate: 0.09, Aggressive: 0.11 };

export function goalProjection(goal, currentValue, riskProfile, now) {
  const years = Math.max(0, diffDays(goal.target_date, now) / 365);
  const r = RETURN_BY_PROFILE[riskProfile] ?? 0.09;
  const mr = r / 12, n = Math.round(years * 12);
  const fvLump = currentValue * Math.pow(1 + r, years);
  const fvContrib = mr > 0 ? Number(goal.monthly_contribution) * ((Math.pow(1 + mr, n) - 1) / mr) : Number(goal.monthly_contribution) * n;
  const projected = fvLump + fvContrib;
  return { projected, ratio: projected / Number(goal.target_amount), years, assumedReturn: r };
}

function goalsAgent(ctx, topic) {
  const { goals, total, riskProfile, now } = ctx;
  if (!goals.length) {
    return { id: 'goals', name: 'Goal Planner', role: 'Whether you are on track', stance: 'neutral', confidence: 0.3, headline: 'No goals set yet.', reasons: ['Add a goal so recommendations can be judged against what you are saving for.'], actions: ['Create your first goal.'] };
  }
  const projections = goals.map(g => ({ g, ...goalProjection(g, total / goals.length, riskProfile, now) }));
  const behind = projections.filter(p => p.ratio < 0.9);
  const reasons = projections.map(p => `${p.g.name}: projected ${pct(p.ratio)} of target at an assumed ${pct(p.assumedReturn)}/yr (illustrative).`);
  let stance = 'neutral'; const actions = [];
  if (topic.action === 'sell') {
    if (behind.length) { stance = 'oppose'; actions.push('Selling growth assets while behind on goals makes catching up harder.'); }
    else { stance = 'neutral'; }
  } else if (topic.action === 'buy') {
    if (behind.length) { stance = 'support'; actions.push('Increasing contributions is the most reliable way to close the gap.'); }
  } else if (behind.length) { stance = 'support'; actions.push('Raise monthly contributions or extend the target date for goals that are behind.'); }
  return { id: 'goals', name: 'Goal Planner', role: 'Whether you are on track', stance, confidence: 0.6, headline: behind.length ? `${behind.length} goal(s) are behind schedule.` : 'Goals look on track.', reasons, actions };
}

/**
 * Run the council. Pure and deterministic; an optional LLM can rewrite `moderator.summary` afterwards.
 */
export function runCouncil(ctx, question) {
  const topic = parseQuestion(question, ctx.positions, ctx.knownSymbols);
  const agents = [riskAgent(ctx, topic), behaviorAgent(ctx, topic), taxAgent(ctx, topic), goalsAgent(ctx, topic)];
  const totalW = agents.reduce((s, a) => s + WEIGHT[a.id], 0);
  const net = agents.reduce((s, a) => s + VALUE[a.stance] * WEIGHT[a.id] * a.confidence, 0) / totalW;
  const consensus = net > 0.18 ? 'lean_support' : net < -0.18 ? 'lean_oppose' : 'mixed';
  const sign = consensus === 'lean_support' ? 'support' : consensus === 'lean_oppose' ? 'oppose' : null;
  const dissent = agents.filter(a => (sign ? a.stance !== sign && a.stance !== 'neutral' : a.stance !== 'neutral')).map(a => ({ agent: a.name, stance: a.stance, because: a.reasons[0] ?? a.headline }));

  const label = topic.action === 'rebalance' ? 'rebalancing your portfolio' : `${topic.action === 'sell' ? 'selling' : 'buying'} ${topic.symbol ?? 'this asset'}`;
  const summary = consensus === 'mixed'
    ? `The council is split on ${label}. Weigh the dissenting views below before deciding.`
    : consensus === 'lean_support'
      ? `The council leans towards ${label}${dissent.length ? `, with dissent from ${dissent.map(d => d.agent).join(' and ')}` : ''}.`
      : `The council leans against ${label}${dissent.length ? `, though ${dissent.map(d => d.agent).join(' and ')} disagree` : ''}.`;

  return {
    topic, agents,
    moderator: { consensus, score: Math.round(net * 100) / 100, summary, dissent },
    disclaimer: 'Educational analysis generated from your data and fixed rules. Not investment, tax or legal advice.',
  };
}
