/**
 * Every recommendation in FinAura goes out in this envelope so the user can see why it exists,
 * which of their data drove it, what could go wrong, what else they could do, and how sure we are.
 */
export function explain({ title, verdict, why = [], inputs = {}, risks = [], alternatives = [], confidence = 0.5, uncertainty = '', disclaimer = true }) {
  const c = Math.max(0, Math.min(1, confidence));
  return {
    title, verdict, why, inputs, risks, alternatives,
    confidence: Math.round(c * 100) / 100,
    confidenceLabel: c >= 0.75 ? 'high' : c >= 0.5 ? 'medium' : 'low',
    uncertainty,
    ...(disclaimer ? { disclaimer: 'Educational guidance based on the data you entered. Not licensed investment, tax or insurance advice.' } : {}),
  };
}
