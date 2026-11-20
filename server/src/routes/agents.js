import { z } from 'zod';
import { HttpError } from '../lib/security.js';
import { todayStr } from '../lib/dates.js';
import { loadWealthState } from './planning.js';
import { hashSeed } from '../engines/twin.js';
import { simulateLife, lifeStateFrom } from '../engines/lifemodel.js';
import { stressTest } from '../engines/stress.js';
import { rebalance } from '../engines/planning.js';
import { analyzeBehavior } from '../engines/behavior.js';
import { runPanel, AGENTS, nextWeight } from '../engines/agents5.js';
import { gather } from '../services/assistant.js';
import { awardXp, evaluateAchievements } from '../services/gamify.js';

export async function agentRoutes(app) {
  const { pool } = app;
  const auth = { preHandler: app.requireAuth };
  const heavy = { preHandler: app.requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const idParam = z.object({ id: z.string().uuid() });

  const weightsFor = async userId => Object.fromEntries((await pool.query('SELECT agent_id, weight FROM agent_weights WHERE user_id = $1', [userId])).rows.map(r => [r.agent_id, Number(r.weight)]));

  app.post('/agents/council', heavy, async (req) => {
    const { question } = z.object({ question: z.string().trim().max(500).optional() }).parse(req.body ?? {});
    const today = todayStr(), s = await loadWealthState(pool, req.user, today), c = s.ctx;
    const behavior = analyzeBehavior({ txns: c.txns, seriesBySymbol: c.seriesBySymbol, assets: c.assets, positionsInfo: { positions: c.positions, cryptoWeight: c.cryptoWeight, health: c.health }, riskProfile: c.riskProfile, today, dataQuality: c.dataQuality });
    const ls = lifeStateFrom(s), life = simulateLife(ls, [], { paths: 150, seed: hashSeed(String(req.user.id)) });
    const stress = stressTest(s.nw, s.profile);
    const reb = rebalance({ allocation: s.nw.allocation, riskProfile: c.riskProfile });
    const result = runPanel({ behavior, positions: c.positions, allocation: c.allocation, health: c.health, rebalance: reb, rsi: c.rsi, seriesBySymbol: c.seriesBySymbol, riskProfile: c.riskProfile, dataQuality: c.dataQuality, stress, life: { probabilityFundsLast: life.probabilityFundsLast, assumed: ls.assumed.length > 1 } }, question ?? null, await weightsFor(req.user.id));
    const summary = await app.llm.narrate({
      userId: req.user.id, kind: 'council5', instruction: 'Summarise this panel decision in 3-4 plain sentences for the user. Mention any disagreement honestly and the first one or two actions.',
      facts: { question, verdict: result.advisory.verdict, headline: result.advisory.headline, agents: result.agents.map(a => ({ name: a.name, stance: a.stance, headline: a.headline })), dissent: result.advisory.dissent, actions: result.advisory.actions.slice(0, 3) },
    });
    if (summary) result.advisory.summary = summary;
    const row = (await pool.query('INSERT INTO agent_sessions (user_id, question, result) VALUES ($1,$2,$3) RETURNING id, created_at', [req.user.id, question ?? null, result])).rows[0];
    await awardXp(pool, req.user.id, 'council_run', row.id);
    const unlocked = await evaluateAchievements(pool, req.user.id, c, today);
    return { id: row.id, createdAt: row.created_at, llm: !!summary, unlocked, ...result };
  });

  app.get('/agents/council', auth, async (req) => {
    const { rows } = await pool.query(`SELECT id, question, result->'advisory'->>'verdict' AS verdict, result->'advisory'->>'headline' AS headline, created_at FROM agent_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [req.user.id]);
    return { sessions: rows };
  });
  app.get('/agents/council/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = (await pool.query('SELECT id, question, result, created_at FROM agent_sessions WHERE id = $1 AND user_id = $2', [id, req.user.id])).rows[0];
    if (!r) throw new HttpError(404, 'Session not found', 'not_found');
    const fb = (await pool.query('SELECT agent_id, vote, note FROM agent_feedback WHERE session_id = $1', [id])).rows;
    return { id: r.id, question: r.question, createdAt: r.created_at, feedback: fb, ...r.result };
  });

  // Human in the loop: agree/disagree with an agent. Weights adapt (bounded) and apply to future panels.
  app.post('/agents/council/:id/feedback', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ agentId: z.enum([...AGENTS.map(a => a.id), 'advisory']), vote: z.enum(['agree', 'disagree']), note: z.string().trim().max(300).optional() }).parse(req.body);
    const sess = (await pool.query('SELECT 1 FROM agent_sessions WHERE id = $1 AND user_id = $2', [id, req.user.id])).rowCount;
    if (!sess) throw new HttpError(404, 'Session not found', 'not_found');
    const prev = (await pool.query('SELECT vote FROM agent_feedback WHERE session_id = $1 AND agent_id = $2', [id, b.agentId])).rows[0];
    await pool.query(`INSERT INTO agent_feedback (session_id, user_id, agent_id, vote, note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (session_id, agent_id) DO UPDATE SET vote = $4, note = $5`, [id, req.user.id, b.agentId, b.vote, b.note ?? null]);
    if (!prev || prev.vote !== b.vote) {
      const cur = Number((await pool.query('SELECT weight FROM agent_weights WHERE user_id = $1 AND agent_id = $2', [req.user.id, b.agentId])).rows[0]?.weight ?? 1);
      const undo = prev ? (prev.vote === 'agree' ? -0.05 : 0.08) : 0;
      const w = nextWeight(Math.max(0.5, Math.min(1.5, cur + undo)), b.vote);
      await pool.query(`INSERT INTO agent_weights (user_id, agent_id, weight) VALUES ($1,$2,$3) ON CONFLICT (user_id, agent_id) DO UPDATE SET weight = $3`, [req.user.id, b.agentId, w]);
    }
    return { weights: await weightsFor(req.user.id) };
  });
  app.get('/agents/weights', auth, async (req) => ({ weights: await weightsFor(req.user.id), agents: AGENTS }));

  // ── Grounded conversational assistant ────────────────────────────
  app.post('/assistant', heavy, async (req) => {
    const { message } = z.object({ message: z.string().trim().min(1).max(800) }).parse(req.body);
    const hist = (await pool.query('SELECT role, content FROM assistant_messages WHERE user_id = $1 ORDER BY id DESC LIMIT 6', [req.user.id])).rows.reverse();
    const g = await gather(app, req.user, message);
    const llm = await app.llm.narrate({
      userId: req.user.id, kind: 'assistant', history: hist, question: message, maxTokens: 400,
      instruction: 'Answer the user question conversationally in at most 5 sentences using only the facts. Lead with the direct answer. If facts say data is missing, say what to add.',
      facts: { intent: g.intent, facts: g.facts, draftAnswer: g.answer, suggestedActions: g.actions },
    });
    const reply = llm ?? g.answer;
    await pool.query('INSERT INTO assistant_messages (user_id, role, content) VALUES ($1,$2,$3)', [req.user.id, 'user', message]);
    await pool.query('INSERT INTO assistant_messages (user_id, role, content, intent, meta) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'assistant', reply, g.intent, { escalation: g.escalation, llm: !!llm }]);
    return { intent: g.intent, reply, llm: !!llm, grounded: g.facts, actions: g.actions, escalation: g.escalation };
  });
  app.get('/assistant/history', auth, async (req) => {
    const { rows } = await pool.query('SELECT id, role, content, intent, meta, created_at FROM assistant_messages WHERE user_id = $1 ORDER BY id DESC LIMIT 60', [req.user.id]);
    return { messages: rows.reverse() };
  });
  app.delete('/assistant/history', auth, async (req) => { await pool.query('DELETE FROM assistant_messages WHERE user_id = $1', [req.user.id]); return { ok: true }; });
}
