/**
 * advisoryEngine.js
 * Generates natural-language advisory text from portfolio data.
 */

export function generateAdvisory(scores, assets = [], riskProfile = 'Moderate') {
  const total     = assets.reduce((s, a) => s + (a.value || 0), 0);
  const cryptoPct = assets.filter(a => a.type === 'crypto').reduce((s, a) => s + a.value, 0) / (total || 1);
  const maxCrypto = riskProfile === 'Conservative' ? 0.05 : riskProfile === 'Moderate' ? 0.20 : 0.40;

  const riskAlignmentComment = scores.riskAlignment >= 70
    ? `Your portfolio is well-aligned with your ${riskProfile} risk profile. RSI signals are within healthy ranges.`
    : `Your portfolio shows signs of overextension. Average RSI suggests overbought conditions — consider trimming high-momentum positions.`;

  const cryptoWarning = cryptoPct > maxCrypto
    ? `Crypto overexposure detected: ${(cryptoPct * 100).toFixed(0)}% vs recommended ${(maxCrypto * 100).toFixed(0)}% for ${riskProfile} investors. Consider rebalancing ~$${Math.round((cryptoPct - maxCrypto) * total).toLocaleString()}.`
    : `Crypto allocation is within target range for your ${riskProfile} profile.`;

  const concentrationWarning = (() => {
    const typeMap = {};
    assets.forEach(a => { typeMap[a.type] = (typeMap[a.type] || 0) + a.value; });
    const maxType = Object.entries(typeMap).sort((a, b) => b[1] - a[1])[0];
    if (!maxType) return '';
    const pct = maxType[1] / total;
    return pct > 0.60
      ? `Concentration risk identified: ${(pct * 100).toFixed(0)}% in ${maxType[0]}. Diversify to reduce single-asset-class exposure.`
      : '';
  })();

  const allocationAdvice = (() => {
    const typeCount = new Set(assets.map(a => a.type)).size;
    if (typeCount < 2) return 'Your portfolio is heavily concentrated. Adding bonds or index funds would significantly improve your health score.';
    if (typeCount === 2) return 'Consider adding a third asset class (e.g., bonds or real estate ETFs) to improve diversification.';
    return 'Good asset class spread. Focus on rebalancing within classes to maintain target allocations.';
  })();

  return { riskAlignmentComment, cryptoWarning, concentrationWarning, allocationAdvice };
}

export function getAIResponse(message) {
  const m = message.toLowerCase();

  if (m.includes('drop') || m.includes('fell') || m.includes('down') || m.includes('loss'))
    return "Your portfolio dipped 3.2% last week primarily due to Bitcoin's correction from $71K to $64K. Since BTC is 25% of your portfolio, this had an outsized impact. Your equity positions held steady — this was a market-wide event. Historical data suggests BTC recovers within 3–6 weeks of similar corrections.";

  if (m.includes('crypto') || m.includes('bitcoin') || m.includes('btc') || m.includes('allocation'))
    return "Your crypto allocation is 25%, which is 8% above the recommended threshold for your Moderate risk profile. I'd suggest rebalancing $4,200 from crypto into bonds. That said, if you have a 5+ year horizon and can stomach 40% drawdowns, staying at 25% is defensible. Want me to model both scenarios?";

  if (m.includes('behavior') || m.includes('score') || m.includes('improve') || m.includes('discipline'))
    return "Your behavior score of 74/100 is held back by two patterns: (1) Panic selling during dips — you've sold 3 of the last 4 BTC corrections, and (2) Inconsistent SIP contributions — you missed 2 months this year. Fixing just the panic selling habit could improve your projected 10-year return by ~$18,000.";

  if (m.includes('risk') || m.includes('danger') || m.includes('concern'))
    return "Your biggest risk is crypto concentration. At 25% allocation, a 50% BTC crash (which has happened 4 times historically) would wipe $14,800 from your portfolio. Secondary risk: your bond allocation (12%) is below the recommended 20% for your age group, leaving you exposed in a downturn.";

  if (m.includes('rebalance') || m.includes('realloc'))
    return "Based on your current allocation, I recommend moving $4,200 from crypto to bonds and $2,100 from equities to international ETFs. This would raise your health score from 82 to an estimated 91 and reduce your max drawdown risk by ~18%.";

  if (m.includes('goal') || m.includes('target') || m.includes('retire'))
    return "Based on your current savings rate and portfolio growth of 18.6% YoY, you're on track to reach $500K by age 32 (assuming 7% average annual returns). Setting up an automatic monthly SIP of $500 would accelerate this by ~2 years.";

  return "Based on your portfolio and behavioral patterns, you're making solid long-term decisions. Your S&P 500 position is well-timed and SIP consistency improved 18% this quarter. However, I notice a tendency to react to short-term crypto volatility — this has cost you ~$2,400 in missed recovery gains over 6 months. Want me to dig into any specific area?";
}
