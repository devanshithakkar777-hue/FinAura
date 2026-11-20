import { toDay } from './dates.js';

const BASE = 'https://www.alphavantage.co/query';

/** Fetch recent daily closes from Alpha Vantage. Returns [{day, close}] or throws with a readable message. */
export async function fetchDailyCloses(config, symbol, assetClass) {
  if (!config.ALPHA_VANTAGE_KEY) throw new Error('Market data provider is not configured (ALPHA_VANTAGE_KEY).');
  const params = assetClass === 'crypto'
    ? { function: 'DIGITAL_CURRENCY_DAILY', symbol, market: 'USD' }
    : { function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact' };
  const url = `${BASE}?${new URLSearchParams({ ...params, apikey: config.ALPHA_VANTAGE_KEY })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Provider returned ${res.status}`);
  const data = await res.json();
  if (data.Note || data.Information) throw new Error('Market data rate limit reached. Try again later.');
  const series = data['Time Series (Daily)'] ?? data['Time Series (Digital Currency Daily)'];
  if (!series) throw new Error(`No price data for ${symbol}`);
  return Object.entries(series).map(([day, v]) => {
    const key = Object.keys(v).find(k => /^4[a-z]?\. close/.test(k));
    return { day: toDay(day), close: parseFloat(v[key]) };
  }).filter(r => Number.isFinite(r.close) && r.close > 0);
}
