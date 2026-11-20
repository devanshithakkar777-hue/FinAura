const SYMBOL = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
const LOCALE = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB' };

export const makeMoney = (currency = 'INR') => {
  const nf = new Intl.NumberFormat(LOCALE[currency] ?? 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat(LOCALE[currency] ?? 'en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compact = (n) => {
    const abs = Math.abs(n), sign = n < 0 ? '−' : '';
    const s = SYMBOL[currency] ?? '';
    if (currency === 'INR') {
      if (abs >= 1e7) return `${sign}${s}${(abs / 1e7).toFixed(2)} Cr`;
      if (abs >= 1e5) return `${sign}${s}${(abs / 1e5).toFixed(2)} L`;
    } else {
      if (abs >= 1e9) return `${sign}${s}${(abs / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${sign}${s}${(abs / 1e6).toFixed(2)}M`;
    }
    if (abs >= 1e3) return `${sign}${s}${(abs / 1e3).toFixed(1)}k`;
    return `${sign}${s}${Math.round(abs)}`;
  };
  return { full: n => nf.format(n ?? 0), precise: n => nf2.format(n ?? 0), compact, symbol: SYMBOL[currency] ?? '' };
};

export const pct = (n, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(d)}%`;
export const pctPlain = (n, d = 0) => `${(n * 100).toFixed(d)}%`;
export const signed = n => (n >= 0 ? '+' : '−');

export const shortDate = s => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
export const monthLabel = s => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

export const CLASS_LABEL = { equity: 'Equity', crypto: 'Crypto', mutualFund: 'Mutual fund', bond: 'Bonds', gold: 'Gold', cash: 'Cash' };
export const CLASS_COLOR = { equity: '#7c8cff', crypto: '#ffb454', mutualFund: '#35e0c5', bond: '#8fd3ff', gold: '#ffd76b', cash: '#9aa0c8' };

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
