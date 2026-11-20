import { explain } from '../lib/explain.js';

export const CATEGORIES = { investment: 'Investments', tax: 'Tax', insurance: 'Insurance', estate: 'Estate & succession', debt: 'Debt & credit', nri: 'NRI & cross-border', business: 'Business & SME', general: 'General planning' };
export const CONSULT_KINDS = ['chat', 'audio', 'video', 'callback', 'second_opinion'];

/** Professional capacities differ in what they may do. Shown to users so they know who is advising in what role. */
export const CAPACITIES = {
  investment_adviser: { label: 'Registered investment adviser', regulated: true, personalAdvice: true, categories: ['investment', 'general'], can: 'Give personalised investment advice for a fee, under the regulator’s registration.', cannot: 'Earn commissions on products they recommend (fee-only rules apply).' },
  research_analyst: { label: 'Registered research analyst', regulated: true, personalAdvice: false, categories: ['investment'], can: 'Publish research and views on securities.', cannot: 'Give personalised portfolio advice unless also a registered investment adviser.' },
  mf_distributor: { label: 'Mutual fund distributor', regulated: true, personalAdvice: false, categories: ['investment'], can: 'Help you buy mutual funds and explain products. May earn commission from fund houses.', cannot: 'Give independent, fee-only investment advice.' },
  insurance_intermediary: { label: 'Insurance intermediary', regulated: true, personalAdvice: false, categories: ['insurance'], can: 'Explain and sell insurance products and help with claims. May earn commission from insurers.', cannot: 'Give investment advice.' },
  chartered_accountant: { label: 'Chartered accountant', regulated: true, personalAdvice: false, categories: ['tax', 'business', 'nri', 'estate'], can: 'Tax planning, filing, notices, audits and accounting.', cannot: 'Give securities investment advice unless separately registered.' },
  tax_practitioner: { label: 'Tax practitioner', regulated: false, personalAdvice: false, categories: ['tax'], can: 'Help with tax computation and filing.', cannot: 'Represent you before tax authorities unless authorised to.' },
  estate_lawyer: { label: 'Lawyer (wills & succession)', regulated: true, personalAdvice: false, categories: ['estate'], can: 'Draft wills and trusts and advise on succession law.', cannot: 'Give investment advice.' },
  certified_financial_planner: { label: 'Certified financial planner', regulated: false, personalAdvice: false, categories: ['general', 'debt', 'estate'], can: 'Holistic planning: goals, cash flow, insurance, retirement.', cannot: 'Recommend specific securities unless also a registered investment adviser.' },
  credit_counsellor: { label: 'Credit and debt counsellor', regulated: false, personalAdvice: false, categories: ['debt'], can: 'Help with repayment plans and credit-report issues.', cannot: 'Negotiate on your behalf unless authorised.' },
};
export const publicCapacities = () => Object.entries(CAPACITIES).map(([key, c]) => ({ key, ...c }));
/** An unregulated-title capacity must not be presented as one that gives personal investment advice. */
export const regulatedNeedsRegistration = capacity => CAPACITIES[capacity]?.regulated === true;

/* ── Trust score ── */
export function trustScore({ verified, ratings = [], openComplaints = 0, upheldComplaints = 0, completed = 0, hasDisclosures = true }) {
  if (!verified) return { score: 0, tier: 'unverified', components: [], explain: null };
  const n = ratings.length, avg = n ? ratings.reduce((s, r) => s + r, 0) / n : null;
  const PRIOR = 4.0, W = 5, bayes = ((avg ?? PRIOR) * n + PRIOR * W) / (n + W);   // shrinks small samples toward a neutral prior
  const comps = [
    { key: 'verification', max: 40, got: 40 + 0, detail: 'Credentials reviewed by FinAura' },
    { key: 'disclosures', max: 10, got: hasDisclosures ? 10 : 0, detail: 'Fees and conflicts disclosed' },
    { key: 'ratings', max: 30, got: Math.round(((bayes - 1) / 4) * 30), detail: n ? `${avg.toFixed(1)} average from ${n} review(s), adjusted for sample size` : 'No reviews yet; neutral starting value' },
    { key: 'experience', max: 10, got: Math.min(10, completed), detail: `${completed} completed consultation(s) on FinAura` },
    { key: 'conduct', max: 10, got: Math.max(0, 10 - openComplaints * 2 - upheldComplaints * 5), detail: `${openComplaints} open and ${upheldComplaints} upheld complaint(s)` },
  ];
  const score = Math.max(0, Math.min(100, comps.reduce((s, c) => s + c.got, 0)));
  const tier = score >= 80 && n >= 5 ? 'established' : score >= 60 ? 'trusted' : 'new';
  return { score, tier, ratingCount: n, averageRating: avg == null ? null : Math.round(avg * 10) / 10, components: comps, explain: explain({ title: 'Trust score', verdict: `${score}/100 (${tier})`, why: comps.map(c => `${c.key}: ${c.got}/${c.max} — ${c.detail}`), inputs: { n, openComplaints, upheldComplaints, completed }, risks: ['A score is a summary, not a guarantee of quality or suitability.', 'Few reviews means more uncertainty.'], alternatives: ['Read the profile, the disclosures and the reviews yourself.'], confidence: n >= 10 ? 0.8 : n >= 3 ? 0.6 : 0.4, uncertainty: 'Reviews come only from FinAura users who completed a consultation.' }) };
}

/* ── Need classification and matching ── */
const KEYWORDS = {
  tax: /\btax|itr|capital gain|regime|80c|notice|refund|tds\b/i, insurance: /insur|term plan|health cover|claim|policy|premium/i,
  estate: /\bwill\b|inherit|succession|estate|nominee|trust\b|legacy/i, debt: /\bloan|debt|emi\b|credit (card|score)|cibil|borrow|prepay/i,
  nri: /\bnri\b|abroad|overseas|foreign|cross[- ]border|\bh1b\b|\bfema\b/i, business: /\bgst\b|business|startup|company|sme|payroll/i,
  investment: /invest|portfolio|mutual fund|\bsip\b|stock|equity|rebalanc|asset allocation|retire/i,
};
export function classifyNeed(text) {
  const hits = Object.entries(KEYWORDS).filter(([, re]) => re.test(text)).map(([k]) => k);
  const wantsPersonalAdvice = /(should i|which|what).*(buy|sell|invest in)|recommend.*(fund|stock)|what to buy/i.test(text);
  return { categories: hits.length ? hits : ['general'], wantsPersonalAdvice };
}
const IST = 5.5 * 3600000;
/** availability: [{day:0-6 (Sun=0), start:'HH:MM', end:'HH:MM'}] in IST. */
export function inAvailability(avail, iso) {
  if (!avail?.length) return false;
  const d = new Date(new Date(iso).getTime() + IST), day = d.getUTCDay(), mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const m = t => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
  return avail.some(s => s.day === day && mins >= m(s.start) && mins + 30 <= m(s.end));
}
export function matchExperts({ need, experts, language, maxFee, nri }) {
  const out = [];
  for (const e of experts) {
    if (e.status !== 'verified') continue;
    const reasons = [], cautions = []; let score = 0;
    const cap = CAPACITIES[e.capacity];
    const catHit = need.categories.includes(e.category) ? need.categories.indexOf(e.category) === 0 ? 40 : 30 : cap?.categories.some(c => need.categories.includes(c)) ? 15 : 0;
    if (catHit >= 30) reasons.push(`Works in ${CATEGORIES[e.category] ?? e.category}`); else if (catHit) reasons.push('Related area of practice');
    score += catHit;
    if (!catHit) continue;
    const spec = (e.specialties ?? []).filter(s => need.text && need.text.toLowerCase().includes(s.toLowerCase()));
    if (spec.length) { score += Math.min(20, spec.length * 10); reasons.push(`Specialises in ${spec.join(', ')}`); }
    if (language && (e.languages ?? []).map(l => l.toLowerCase()).includes(language.toLowerCase())) { score += 10; reasons.push(`Speaks ${language}`); } else if (language) cautions.push(`May not speak ${language}`);
    if (maxFee != null) { if (e.fee <= maxFee) { score += 10; reasons.push('Within your budget'); } else cautions.push('Above your budget'); }
    if (nri) { if (e.accepts_nri || e.category === 'nri') { score += 10; reasons.push('Works with NRIs'); } else cautions.push('Not set up for NRI clients'); }
    score += Math.round((e.trust?.score ?? 0) * 0.15); if (e.trust?.score) reasons.push(`Trust score ${e.trust.score}`);
    if (need.wantsPersonalAdvice) { if (cap?.personalAdvice) { score += 15; reasons.push('Registered to give personalised investment advice'); } else cautions.push(`As a ${cap?.label?.toLowerCase() ?? 'professional'}, they may not be able to tell you what to buy or sell`); }
    out.push({ expertId: e.id, name: e.display_name, capacity: cap?.label ?? e.capacity, score, reasons, cautions });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Deterministic pre-consult brief built only from what the user chose to share. */
export function buildBrief({ consultation, shared }) {
  const lines = [];
  lines.push(`Topic: ${consultation.topic}`, `Question: ${consultation.question}`);
  const i = consultation.intake ?? {};
  Object.entries(i).filter(([, v]) => v != null && v !== '').forEach(([k, v]) => lines.push(`${k}: ${v}`));
  if (consultation.kind === 'second_opinion' && consultation.original_advice) lines.push(`Advice being reviewed: ${consultation.original_advice}`);
  if (shared.netWorth != null) lines.push(`Net worth (shared): ${Math.round(shared.netWorth).toLocaleString('en-IN')}`);
  if (shared.wellness) lines.push(`Wellness score (shared): ${shared.wellness.score}/100, weakest area ${shared.wellness.weakest}`);
  if (shared.plan) lines.push(`Retirement readiness (shared): ${Math.round(shared.plan.retirementReadiness * 100)}%`);
  if (shared.behaviour?.flags?.length) lines.push(`Behaviour flags (shared): ${shared.behaviour.flags.join(', ')}`);
  return { lines, sharedScopes: Object.keys(shared), aiNotice: 'This brief was assembled automatically by FinAura (AI-assisted) from information the client chose to share. It is not advice and may be incomplete. Confirm facts with the client.' };
}
