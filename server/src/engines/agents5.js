import { explain } from '../lib/explain.js';
import { signalFor } from './planning.js';

/**
 * Five-agent advisory system. Four specialists reason independently from the user's data;
 * the Advisory agent weighs them (using per-user weights learned from feedback), shows dissent,
 * and returns a decision with the full explanation envelope. Pure and deterministic.
 */
export const AGENTS = [
  { id: 'behaviour', name: 'Behaviour Agent', role: 'How you tend to act under pressure' },
  { id: 'portfolio', name: 'Portfolio Agent', role: 'Diversification, concentration and drift' },
  { id: 'market', name: 'Market Agent', role: 'Momentum and trend across your holdings' },
  { id: 'simulation', name: 'Simulation Agent', role: 'What stress and the long run could do to you' },
];
const pct = n => `${Math.round(n * 100)}%`;
const mk = (id, stance, confidence, headline, reasons, actions, extra = {}) => ({ ...AGENTS.find(a => a.id === id), stance, confidence: Math.round(confidence * 100) / 100, headline, reasons, actions, ...extra });

// stance: 'caution' (slow down / reduce risk), 'support' (fine to proceed / add), 'neutral'

function behaviourAgent({ behavior }) {
  if (!behavior || behavior.status !== 'ok') return mk('behaviour', 'neutral', 0.25, 'Not enough trade history to read your habits.', ['Behavioural patterns need roughly a dozen logged trades.'], ['Log or import your past trades to unlock this agent.']);
  const reasons = [`Your discipline score is ${behavior.score}/100.`], actions = [];
  const alpha = behavior.alpha;
  if (alpha?.amount < 0) reasons.push(`Reactive sells have cost you about ${Math.abs(Math.round(alpha.amount)).toLocaleString('en-IN')} versus holding.`);
  const bad = (behavior.patterns ?? []).filter(p => p.severity === 'concern' || p.severity === 'watch').slice(0, 2);
  bad.forEach(p => reasons.push(`${p.label}: ${p.detail}`));
  const caution = behavior.score < 55 || alpha?.panicCost < 0 || bad.some(p => p.severity === 'concern');
  if (caution) actions.push('Wait 24 hours before acting on any large move.', 'Write down why you are acting before you place the order.');
  return mk('behaviour', caution ? 'caution' : behavior.score >= 75 ? 'support' : 'neutral', behavior.stats?.sells >= 3 ? 0.7 : 0.5, caution ? 'Your own history says slow down before reacting.' : 'Your trading habits look steady.', reasons, actions);
}

function portfolioAgent({ positions, allocation, health, rebalance }) {
  if (!positions.length) return mk('portfolio', 'neutral', 0.2, 'No market holdings to assess.', ['Add holdings to analyse diversification.'], []);
  const top = positions[0], reasons = [`Portfolio health score ${health.total}/100; diversification ${health.diversification}/100.`], actions = [];
  let caution = false;
  if (top.weight > 0.3) { caution = true; reasons.push(`${top.symbol} is ${pct(top.weight)} of the portfolio.`); actions.push(`Direct new money away from ${top.symbol} until it falls below 25%.`); }
  if (allocation.length < 3) { caution = true; reasons.push(`Only ${allocation.length} asset class(es) held.`); actions.push('Add an asset class with a different risk driver (for example gold or bonds).'); }
  if (rebalance?.ready && rebalance.needsRebalance) { reasons.push(`The largest drift from the target mix is ${Math.round(rebalance.maxDrift * 100)} points.`); actions.push('Rebalance mainly with fresh contributions to avoid realising tax.'); }
  return mk('portfolio', caution ? 'caution' : health.total >= 70 ? 'support' : 'neutral', 0.75, caution ? 'Your portfolio is more concentrated than it should be.' : 'Your portfolio mix is reasonable.', reasons, actions);
}

function marketAgent({ positions, rsi, seriesBySymbol, riskProfile, dataQuality }) {
  if (!positions.length) return mk('market', 'neutral', 0.2, 'No holdings to scan.', [], []);
  const sigs = positions.map(p => signalFor(p, seriesBySymbol.get(p.symbol) ?? [], rsi.get(p.symbol) ?? null, riskProfile));
  const trim = sigs.filter(s => s.action === 'trim'), add = sigs.filter(s => s.action === 'accumulate');
  const reasons = [`${trim.length} holding(s) signal trim, ${add.length} signal accumulate, ${sigs.length - trim.length - add.length} hold.`];
  trim.slice(0, 2).forEach(s => reasons.push(`${s.symbol}: ${s.explain.why[0] ?? 'overextended'}`));
  const low = dataQuality !== 'market';
  if (low) reasons.push('Price history is thin for some holdings, so signals are low reliability.');
  return mk('market', trim.length > add.length ? 'caution' : add.length > trim.length ? 'support' : 'neutral', low ? 0.3 : 0.55, trim.length > add.length ? 'Several holdings look stretched right now.' : add.length > trim.length ? 'Some holdings look attractively priced.' : 'No strong market signal.', reasons, trim.length ? ['Avoid adding to the stretched holdings; stagger any new buying.'] : [], { signals: sigs.map(s => ({ symbol: s.symbol, action: s.action })) });
}

function simulationAgent({ stress, life }) {
  const reasons = [], actions = [];
  let caution = false, conf = 0.4;
  if (stress?.worst) { reasons.push(`In the harshest stress test (${stress.worst.label}) assets would fall ${pct(Math.abs(stress.worst.lossPct))}.`); if (stress.worst.severity === 'severe' || stress.worst.severity === 'high') { caution = true; actions.push('Lower exposure to the most volatile holdings or build a larger cash buffer.'); } conf = 0.55; }
  if (life) { reasons.push(`In ${pct(life.probabilityFundsLast)} of simulated futures your money lasts to age 85.`); if (life.probabilityFundsLast < 0.65) { caution = true; actions.push('Raise savings or push retirement later; see the lever analysis.'); } conf = Math.max(conf, life.assumed ? 0.4 : 0.6); }
  if (!reasons.length) return mk('simulation', 'neutral', 0.2, 'Not enough data to simulate.', ['Add your profile and holdings.'], ['Complete your financial profile.']);
  return mk('simulation', caution ? 'caution' : 'support', conf, caution ? 'Simulations show real downside risk.' : 'Simulations show you can absorb a bad stretch.', reasons, actions);
}

/**
 * @param agents    four specialist outputs
 * @param weights   { agentId: 0.5..1.5 } learned from the user’s feedback
 */
export function advisoryAgent(agents, weights = {}, question = null) {
  const w = a => weights[a.id] ?? 1;
  const val = a => (a.stance === 'caution' ? -1 : a.stance === 'support' ? 1 : 0);
  const num = agents.reduce((s, a) => s + val(a) * a.confidence * w(a), 0), den = agents.reduce((s, a) => s + a.confidence * w(a), 0) || 1;
  const score = num / den;                                   // -1 (caution) .. +1 (support)
  const verdict = score <= -0.25 ? 'slow_down' : score >= 0.25 ? 'proceed_with_care' : 'review';
  const majority = verdict === 'slow_down' ? 'caution' : verdict === 'proceed_with_care' ? 'support' : null;
  const dissent = majority ? agents.filter(a => a.stance !== majority && a.stance !== 'neutral').map(a => ({ agent: a.name, stance: a.stance, why: a.headline })) : [];
  const actions = [...new Set(agents.filter(a => a.stance !== 'support').flatMap(a => a.actions))].slice(0, 5);
  const avgConf = agents.reduce((s, a) => s + a.confidence, 0) / agents.length;
  const headline = { slow_down: 'The panel advises slowing down and reducing risk first.', proceed_with_care: 'The panel sees no major red flags, but proceed deliberately.', review: 'The panel is split; review the points of disagreement before acting.' }[verdict];
  return mk('advisory', verdict === 'slow_down' ? 'caution' : verdict === 'proceed_with_care' ? 'support' : 'neutral', avgConf, headline, agents.map(a => `${a.name}: ${a.headline}`), actions, {
    id: 'advisory', name: 'Advisory Agent', role: 'Weighs the specialists and decides', verdict, score: Math.round(score * 100) / 100, dissent, weightsUsed: Object.fromEntries(agents.map(a => [a.id, w(a)])),
    explain: explain({
      title: question ? `Panel view: ${question}` : 'Panel view', verdict: headline,
      why: agents.map(a => `${a.name} (${a.stance}, ${Math.round(a.confidence * 100)}% sure): ${a.headline}`),
      inputs: { agents: agents.map(a => a.id), weights: Object.fromEntries(agents.map(a => [a.id, w(a)])) },
      risks: ['Agents work from the data you entered and simple rules; none sees your whole life.', ...(dissent.length ? [`${dissent.length} agent(s) disagree: ${dissent.map(d => d.agent).join(', ')}.`] : [])],
      alternatives: ['Ask a human expert to review this (FinAura Connect).', 'Run a what-if on the specific decision first.'],
      confidence: avgConf, uncertainty: 'Agreement between agents is not proof of correctness.',
    }),
  });
}

export function runPanel(ctx, question, weights) {
  const specialists = [behaviourAgent(ctx), portfolioAgent(ctx), marketAgent(ctx), simulationAgent(ctx)];
  return { question: question ?? null, agents: specialists, advisory: advisoryAgent(specialists, weights, question) };
}

/** Nudge a weight toward agents the user agrees with. Clamped to [0.5, 1.5]. */
export const nextWeight = (cur, vote) => Math.max(0.5, Math.min(1.5, Math.round((cur + (vote === 'agree' ? 0.05 : -0.08)) * 100) / 100));
