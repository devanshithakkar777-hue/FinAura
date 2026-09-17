/**
 * marketApi.js
 * Market data service. Falls back to static mock data when API keys are not configured.
 */
import axios from 'axios';

const ALPHA_KEY = import.meta.env.VITE_ALPHA_VANTAGE_KEY || '';
const BASE_URL  = 'https://www.alphavantage.co/query';

export const MOCK_QUOTES = [
  { ticker: 'AAPL',  name: 'Apple Inc.',            price: 189.30, change: 0.84,  cap: '$2.94T', icon: '🍎', cat: 'Stocks' },
  { ticker: 'NVDA',  name: 'NVIDIA Corp.',           price: 875.40, change: 2.31,  cap: '$2.16T', icon: '🟢', cat: 'Stocks' },
  { ticker: 'TSLA',  name: 'Tesla Inc.',             price: 248.50, change: -0.91, cap: '$790B',  icon: '⚡', cat: 'Stocks' },
  { ticker: 'BTC',   name: 'Bitcoin',                price: 67420,  change: 3.81,  cap: '$1.32T', icon: '₿',  cat: 'Crypto' },
  { ticker: 'ETH',   name: 'Ethereum',               price: 3540,   change: 2.14,  cap: '$425B',  icon: '⟠', cat: 'Crypto' },
  { ticker: 'SOL',   name: 'Solana',                 price: 182.60, change: -1.23, cap: '$82B',   icon: '◎', cat: 'Crypto' },
  { ticker: 'SPY',   name: 'S&P 500 ETF',            price: 478.32, change: 1.24,  cap: '$520B',  icon: '📊', cat: 'ETFs' },
  { ticker: 'MALCF', name: 'Mirae Asset Large Cap',  price: 54.70,  change: 0.62,  cap: '₹38,200Cr', icon: '🏦', cat: 'Mutual Funds' },
];

export const MOCK_INDICES = [
  { name: 'S&P 500',      value: '5,234.18',   change: '+0.87%', up: true  },
  { name: 'NASDAQ',       value: '16,428.82',  change: '+1.14%', up: true  },
  { name: 'NIFTY 50',     value: '22,147.00',  change: '-0.43%', up: false },
  { name: 'BTC Dom.',     value: '52.4%',      change: '+0.3%',  up: true  },
  { name: 'Fear & Greed', value: '72 · Greed', change: '+4',     up: true  },
];

export async function fetchQuote(symbol) {
  if (!ALPHA_KEY) return MOCK_QUOTES.find(q => q.ticker === symbol) || null;
  try {
    const { data } = await axios.get(BASE_URL, {
      params: { function: 'GLOBAL_QUOTE', symbol, apikey: ALPHA_KEY },
      timeout: 8000,
    });
    const q = data['Global Quote'];
    if (!q || !q['05. price']) return null;
    return {
      ticker: symbol,
      price:  parseFloat(q['05. price']),
      change: parseFloat(q['10. change percent']),
    };
  } catch {
    return MOCK_QUOTES.find(q => q.ticker === symbol) || null;
  }
}

export async function fetchQuotes(symbols) {
  if (!ALPHA_KEY) return MOCK_QUOTES.filter(q => symbols.includes(q.ticker));
  const results = await Promise.allSettled(symbols.map(fetchQuote));
  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}
