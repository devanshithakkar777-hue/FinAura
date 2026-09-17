export const PORTFOLIO_HISTORY = [
  { d: 'Jan', v: 82000  }, { d: 'Feb', v: 87500  }, { d: 'Mar', v: 84200  },
  { d: 'Apr', v: 91000  }, { d: 'May', v: 95400  }, { d: 'Jun', v: 92100  },
  { d: 'Jul', v: 98700  }, { d: 'Aug', v: 103200 }, { d: 'Sep', v: 99800  },
  { d: 'Oct', v: 108500 }, { d: 'Nov', v: 112300 }, { d: 'Dec', v: 118640 },
];

export const HOLDINGS = [
  { name: 'S&P 500 ETF',           ticker: 'SPY',   type: 'Equity',      qty: 94,   avgCost: 421.5,  current: 478.32, icon: '📈', color: '#818cf8', alloc: 45 },
  { name: 'Bitcoin',               ticker: 'BTC',   type: 'Crypto',      qty: 0.37, avgCost: 52000,  current: 67420,  icon: '₿',  color: '#fbbf24', alloc: 25 },
  { name: 'Mirae Asset Large Cap', ticker: 'MALCF', type: 'Mutual Fund', qty: 312,  avgCost: 48.2,   current: 54.7,   icon: '🏦', color: '#6ee7b7', alloc: 18 },
  { name: 'US Treasury 10Y',       ticker: 'TLT',   type: 'Bond',        qty: 145,  avgCost: 101.2,  current: 97.8,   icon: '🏛️', color: '#67e8f9', alloc: 12 },
];

export const ALLOCATION = [
  { name: 'Equities',     value: 45, color: '#818cf8' },
  { name: 'Crypto',       value: 25, color: '#fbbf24' },
  { name: 'Mutual Funds', value: 18, color: '#6ee7b7' },
  { name: 'Bonds',        value: 12, color: '#67e8f9' },
];

export const MARKET_INDICES = [
  { name: 'S&P 500',      value: '5,234.18',   change: '+0.87%', up: true  },
  { name: 'NASDAQ',       value: '16,428.82',  change: '+1.14%', up: true  },
  { name: 'NIFTY 50',     value: '22,147.00',  change: '-0.43%', up: false },
  { name: 'BTC Dom.',     value: '52.4%',      change: '+0.3%',  up: true  },
  { name: 'Fear & Greed', value: '72 · Greed', change: '+4',     up: true  },
];

export const MARKET_QUOTES = [
  { ticker: 'AAPL',  name: 'Apple Inc.',            price: '$189.30', change: '+0.84%', up: true,  cap: '$2.94T',    icon: '🍎', cat: 'Stocks',       spark: [182,184,181,186,188,187,189] },
  { ticker: 'NVDA',  name: 'NVIDIA Corp.',           price: '$875.40', change: '+2.31%', up: true,  cap: '$2.16T',    icon: '🟢', cat: 'Stocks',       spark: [820,835,828,850,860,868,875] },
  { ticker: 'BTC',   name: 'Bitcoin',                price: '$67,420', change: '+3.81%', up: true,  cap: '$1.32T',    icon: '₿',  cat: 'Crypto',       spark: [62000,63500,61800,64200,65800,66400,67420] },
  { ticker: 'ETH',   name: 'Ethereum',               price: '$3,540',  change: '+2.14%', up: true,  cap: '$425B',     icon: '⟠', cat: 'Crypto',       spark: [3200,3280,3190,3350,3420,3490,3540] },
  { ticker: 'SOL',   name: 'Solana',                 price: '$182.60', change: '-1.23%', up: false, cap: '$82B',      icon: '◎', cat: 'Crypto',       spark: [192,188,190,185,183,184,182] },
  { ticker: 'SPY',   name: 'S&P 500 ETF',            price: '$478.32', change: '+1.24%', up: true,  cap: '$520B',     icon: '📊', cat: 'ETFs',         spark: [465,468,464,470,473,476,478] },
  { ticker: 'MALCF', name: 'Mirae Asset Large Cap',  price: '₹54.70',  change: '+0.62%', up: true,  cap: '₹38,200Cr', icon: '🏦', cat: 'Mutual Funds', spark: [52,52.5,52.2,53,53.5,54.1,54.7] },
  { ticker: 'TSLA',  name: 'Tesla Inc.',             price: '$248.50', change: '-0.91%', up: false, cap: '$790B',     icon: '⚡', cat: 'Stocks',       spark: [255,252,254,250,249,250,248] },
];

export const LEADERBOARD = [
  { rank: 1, name: 'Priya S.',  score: 94, xp: 12400, streak: 18, badge: '🏆', you: false, badges: ['Diversification Pro', 'Consistent Saver'] },
  { rank: 2, name: 'Rahul M.',  score: 91, xp: 11200, streak: 12, badge: '🥈', you: false, badges: ['Risk Balanced'] },
  { rank: 3, name: 'Alex K.',   score: 82, xp: 9800,  streak: 7,  badge: '🥉', you: true,  badges: ['Crypto Explorer'] },
  { rank: 4, name: 'Sneha T.',  score: 79, xp: 8900,  streak: 5,  badge: '',   you: false, badges: ['Volatility Warning'] },
  { rank: 5, name: 'Arjun P.',  score: 74, xp: 7600,  streak: 3,  badge: '',   you: false, badges: [] },
];

export const AI_INSIGHTS = [
  {
    id: 1, accent: '#f59e0b', bg: 'bg-amber-500/[0.07]', border: 'border-amber-500/20',
    tag: 'Behavior Alert', title: 'Panic Sell Pattern Detected',
    summary: 'You sold BTC during 3 of the last 4 dips.',
    detail: 'This pattern has cost you approximately $2,400 in missed recovery gains over 6 months.',
    impact: '-$2,400 opportunity cost',
  },
  {
    id: 2, accent: '#6366f1', bg: 'bg-indigo-500/[0.07]', border: 'border-indigo-500/20',
    tag: 'AI Suggestion', title: 'Rebalancing Opportunity',
    summary: 'Your crypto allocation is significantly higher than your risk profile suggests.',
    detail: 'Reducing crypto exposure from 25% to 17% would improve your health score by 11 points.',
    impact: '+11 health score pts',
  },
  {
    id: 3, accent: '#10b981', bg: 'bg-emerald-500/[0.07]', border: 'border-emerald-500/20',
    tag: 'Positive Signal', title: 'Diversification Improving',
    summary: 'Your diversification score improved 12 pts this month.',
    detail: 'Consistent SIP contributions across 4 asset classes are paying off.',
    impact: '+12 diversification pts',
  },
];

export const ACHIEVEMENTS = [
  { emoji: '🚀', name: 'First Investment',   desc: 'Made your first trade',       unlocked: true  },
  { emoji: '💎', name: 'Diamond Hands',      desc: 'Held through a 20% dip',      unlocked: true  },
  { emoji: '🎯', name: 'Goal Setter',        desc: 'Set 3 financial goals',        unlocked: true  },
  { emoji: '📈', name: 'Bull Run',           desc: 'Portfolio up 15% in a month',  unlocked: true  },
  { emoji: '🧠', name: 'Behavior Master',    desc: 'Score 90+ behavior rating',    unlocked: false },
  { emoji: '🌍', name: 'Global Diversifier', desc: 'Invest in 5+ countries',       unlocked: false },
  { emoji: '⚡', name: 'SIP Streak',         desc: '12 consecutive SIP months',    unlocked: false },
  { emoji: '🏆', name: 'Top 1%',             desc: 'Outperform 99% of users',      unlocked: false },
  { emoji: '🔮', name: 'AI Whisperer',       desc: 'Follow 10 AI recommendations', unlocked: false },
];
