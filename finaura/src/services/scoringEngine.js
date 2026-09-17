/**
 * scoringEngine.js
 * Computes portfolio health score, behavior score, and sub-scores.
 */

const WEIGHTS = {
  diversification: 0.30,
  volatility:      0.25,
  cryptoExposure:  0.20,
  riskAlignment:   0.25,
};

const ZERO_SCORES = { total: 0, diversification: 0, volatility: 0, cryptoExposure: 0, riskAlignment: 0 };

/**
 * @param {Array}  assets      - Array of { type, value, volatility, rsi_value }
 * @param {string} riskProfile - 'Conservative' | 'Moderate' | 'Aggressive'
 * @returns {Object} scores
 */
export function computeHealthScore(assets, riskProfile = 'Moderate') {
  // Guard: validate input before any computation
  if (!assets?.length) return ZERO_SCORES;

  const total = assets.reduce((s, a) => s + (a.value || 0), 0);
  if (total === 0) return ZERO_SCORES;

  // Diversification: penalise concentration
  const typeMap = {};
  assets.forEach(a => {
    typeMap[a.type] = (typeMap[a.type] || 0) + a.value;
  });
  const typeCount  = Object.keys(typeMap).length;
  const maxAlloc   = Math.max(...Object.values(typeMap)) / total;
  const diversification = Math.round(Math.min(100, (typeCount / 4) * 60 + (1 - maxAlloc) * 40));

  // Volatility: penalise high-vol assets
  const volScore = assets.reduce((s, a) => {
    const w = a.value / total;
    const v = a.volatility === 'Low' ? 100 : a.volatility === 'Moderate' ? 65 : 30;
    return s + v * w;
  }, 0);
  const volatility = Math.round(volScore);

  // Crypto exposure: penalise when over the profile-appropriate max
  const cryptoVal  = assets
    .filter(a => a.type === 'crypto')
    .reduce((s, a) => s + a.value, 0);
  const cryptoPct  = cryptoVal / total;
  const maxCrypto  = riskProfile === 'Conservative' ? 0.05
    : riskProfile === 'Aggressive' ? 0.40
    : 0.20; // Moderate default
  const cryptoExposure = Math.round(
    Math.max(0, 100 - Math.max(0, cryptoPct - maxCrypto) * 300)
  );

  // Risk alignment via RSI
  const avgRsi = assets.reduce(
    (s, a) => s + (a.rsi_value || 50) * (a.value / total),
    0
  );
  const rsiPenalty    = avgRsi > 70 ? (avgRsi - 70) * 2
    : avgRsi < 30 ? (30 - avgRsi) * 1.5
    : 0;
  const riskAlignment = Math.round(Math.max(0, 100 - rsiPenalty));

  const score = Math.round(
    diversification * WEIGHTS.diversification +
    volatility      * WEIGHTS.volatility +
    cryptoExposure  * WEIGHTS.cryptoExposure +
    riskAlignment   * WEIGHTS.riskAlignment
  );

  return { total: score, diversification, volatility, cryptoExposure, riskAlignment };
}

/**
 * Behavior score based on simulated trading patterns.
 * In production this would read from Firestore trade history.
 */
export function computeBehaviorScore(/* tradeHistory = [] */) {
  // Demo static scores — replace with real computation from Firestore
  return {
    overall:     74,
    patience:    72,
    discipline:  65,
    riskMgmt:    80,
    consistency: 58,
    research:    88,
    diversif:    74,
  };
}

/**
 * XP calculation from actions
 */
export function computeXP(actions = []) {
  const XP_MAP = {
    trade:       50,
    rebalance:   300,
    readInsight: 40,
    sipComplete: 200,
    goalSet:     150,
  };
  return actions.reduce((total, a) => total + (XP_MAP[a.type] || 0), 0);
}

export function levelFromXP(xp) {
  const thresholds = [0, 500, 1500, 3000, 5500, 9000, 13500, 19500, 27000, 36000];
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1;
  }
  return {
    level,
    nextThreshold: thresholds[level] ?? thresholds[thresholds.length - 1],
  };
}
