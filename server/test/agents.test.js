import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser } from './helpers.js';
import { advisoryAgent, runPanel, nextWeight, AGENTS } from '../src/engines/agents5.js';
import { detectIntent, fallPct, escalationFor } from '../src/services/assistant.js';

const ag = (id, stance, confidence) => ({ ...AGENTS.find(a => a.id === id), stance, confidence, headline: `${id} says ${stance}`, reasons: [], actions: stance === 'caution' ? [`act-${id}`] : [] });

describe('five-agent panel', () => {
  it('weighs confidence, reports dissent and attaches an explanation', () => {
    const a = advisoryAgent([ag('behaviour', 'caution', 0.8), ag('portfolio', 'caution', 0.7), ag('market', 'support', 0.3), ag('simulation', 'neutral', 0.5)]);
    expect(a.verdict).toBe('slow_down'); expect(a.dissent.map(d => d.agent)).toEqual(['Market Agent']); expect(a.actions).toContain('act-behaviour');
    expect(a.explain.alternatives.join(' ')).toMatch(/expert/i);
    const split = advisoryAgent([ag('behaviour', 'caution', 0.5), ag('portfolio', 'support', 0.5), ag('market', 'neutral', 0.5), ag('simulation', 'neutral', 0.5)]);
    expect(split.verdict).toBe('review');
  });
  it('learned weights can flip a close call', () => {
    const agents = [ag('behaviour', 'caution', 0.7), ag('portfolio', 'support', 0.5), ag('market', 'support', 0.5), ag('simulation', 'neutral', 0.5)];
    const neutral = advisoryAgent(agents).verdict;
    const distrust = advisoryAgent(agents, { portfolio: 0.5, market: 0.5, behaviour: 1.5 }).verdict;
    expect(neutral).not.toBe('slow_down'); expect(distrust).toBe('slow_down');
    expect(nextWeight(1.48, 'agree')).toBe(1.5); expect(nextWeight(0.52, 'disagree')).toBe(0.5); expect(nextWeight(1, 'disagree')).toBe(0.92);
  });
  it('runs with an empty portfolio without crashing and flags low confidence', () => {
    const r = runPanel({ behavior: { status: 'insufficient_data' }, positions: [], allocation: [], health: { total: 0 }, rsi: new Map(), seriesBySymbol: new Map(), riskProfile: 'Moderate', stress: null, life: null }, 'test');
    expect(r.agents).toHaveLength(4); expect(r.agents.every(a => a.confidence <= 0.25)).toBe(true); expect(r.advisory.verdict).toBe('review');
  });
});

describe('assistant routing', () => {
  it('detects intents and the size of a market fall', () => {
    expect(detectIntent('Am I diversified?')).toBe('diversified'); expect(detectIntent('What if the market falls 20%?')).toBe('whatif_fall');
    expect(detectIntent('How much do I need for retirement?')).toBe('retirement'); expect(detectIntent('Which tax regime is better')).toBe('tax');
    expect(detectIntent('hello there')).toBe('overview'); expect(fallPct('what if markets crash 35%')).toBe(0.35); expect(fallPct('what if it falls 250%')).toBe(0.9);
  });
  it('escalates regulated or specialist questions to a human expert', () => {
    expect(escalationFor('Should I sell my investments to buy a flat?').category).toMatch(/planner/i);
    expect(escalationFor('I am an NRI, how do I file?').category).toMatch(/NRI/);
    expect(escalationFor('Which stock should I buy?').category).toMatch(/SEBI/);
    expect(escalationFor('Am I diversified?').recommended).toBe(false);
  });
});

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

describe('agents and assistant API', () => {
  it('runs the panel, stores feedback, and adapts weights bounded and idempotently', async () => {
    const { c } = await newUser(app);
    await c.post('/api/demo');
    await c.put('/api/profile', { age: 32, retirementAge: 60, annualIncome: 1800000, monthlyExpenses: 50000 });
    const r = await c.post('/api/agents/council', { question: 'Should I rebalance?' });
    expect(r.status).toBe(200); expect(r.body.agents).toHaveLength(4); expect(r.body.advisory.explain.risks.length).toBeGreaterThan(0); expect(r.body.llm).toBe(false);
    const id = r.body.id;
    expect((await c.post(`/api/agents/council/${id}/feedback`, { agentId: 'market', vote: 'disagree' })).body.weights.market).toBe(0.92);
    expect((await c.post(`/api/agents/council/${id}/feedback`, { agentId: 'market', vote: 'disagree' })).body.weights.market).toBe(0.92);   // same vote twice: no double count
    expect((await c.post(`/api/agents/council/${id}/feedback`, { agentId: 'market', vote: 'agree' })).body.weights.market).toBe(1.05);        // changed mind: undo + apply
    expect((await c.post(`/api/agents/council/${id}/feedback`, { agentId: 'nobody', vote: 'agree' })).status).toBe(400);
    const d = (await c.get(`/api/agents/council/${id}`)).body; expect(d.feedback).toHaveLength(1);
    expect((await c.get('/api/agents/council')).body.sessions).toHaveLength(1);
    const other = await newUser(app);
    expect((await other.c.post(`/api/agents/council/${id}/feedback`, { agentId: 'market', vote: 'agree' })).status).toBe(404);
    expect((await other.c.get(`/api/agents/council/${id}`)).status).toBe(404);
  });
  it('answers grounded questions from the user’s own data, keeps history and escalates when needed', async () => {
    const { c } = await newUser(app);
    await c.post('/api/demo');
    await c.put('/api/profile', { age: 30, retirementAge: 58, annualIncome: 2000000, monthlyExpenses: 60000 });
    const a = await c.post('/api/assistant', { message: 'Am I diversified?' });
    expect(a.body.intent).toBe('diversified'); expect(a.body.reply).toMatch(/diversification score/); expect(a.body.llm).toBe(false);
    const f = await c.post('/api/assistant', { message: 'What if the market falls 30%?' });
    expect(f.body.grounded.shockPct).toBe(30); expect(f.body.grounded.loss).toBeLessThan(0);
    expect((await c.post('/api/assistant', { message: 'How much do I need for retirement?' })).body.reply).toMatch(/retire at 58/);
    const e = await c.post('/api/assistant', { message: 'Should I sell my investments to buy a flat?' });
    expect(e.body.escalation.recommended).toBe(true);
    expect((await c.post('/api/assistant', { message: '' })).status).toBe(400);
    expect((await c.get('/api/assistant/history')).body.messages.length).toBe(8);
    expect((await c.del('/api/assistant/history')).status).toBe(200);
    expect((await c.get('/api/assistant/history')).body.messages).toHaveLength(0);
  });
});
