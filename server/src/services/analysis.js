import { loadWealthState } from '../routes/planning.js';
import { retirementPlan, emergencyFund, insuranceAnalysis } from '../engines/planning.js';
import { wellnessScore } from '../engines/ecosystem.js';
import { analyzeBehavior } from '../engines/behavior.js';

export const policiesOf = async (pool, uid) => (await pool.query('SELECT kind, sum_assured::float AS s, annual_premium::float AS p FROM insurance_policies WHERE user_id = $1', [uid])).rows.map(r => ({ kind: r.kind, sumAssured: r.s, annualPremium: r.p }));

/** One place that turns a user's stored data into the shared analysis bundle. */
export async function analyze(pool, user, today) {
  const s = await loadWealthState(pool, user, today);
  const emergency = emergencyFund({ profile: s.profile, liquid: s.nw.liquidAssets, monthlyEmi: s.nw.monthlyEmi });
  const insurance = insuranceAnalysis({ profile: s.profile, policies: await policiesOf(pool, user.id), debt: s.nw.totalDebt, liquidAssets: s.nw.liquidAssets });
  const retirement = retirementPlan({ profile: s.profile, investable: s.investable, monthlySaving: s.goalMonthly, allocation: s.nw.allocation });
  const wellness = wellnessScore({ profile: s.profile, nw: s.nw, emergency, insurance, diversification: s.ctx.health?.diversification ?? null, retirement });
  return { s, emergency, insurance, retirement, wellness };
}
export function behaviourOf(c, today) {
  return analyzeBehavior({ txns: c.txns, seriesBySymbol: c.seriesBySymbol, assets: c.assets, positionsInfo: { positions: c.positions, cryptoWeight: c.cryptoWeight, health: c.health }, riskProfile: c.riskProfile, today, dataQuality: c.dataQuality });
}
