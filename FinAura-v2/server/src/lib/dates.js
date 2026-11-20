const MS = 86_400_000;

export const toDay = d => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));
export const parseDay = s => new Date(`${s.slice(0, 10)}T00:00:00Z`);
export const addDays = (s, n) => toDay(new Date(parseDay(s).getTime() + n * MS));
export const diffDays = (a, b) => Math.round((parseDay(a) - parseDay(b)) / MS); // a - b
export const todayStr = () => toDay(new Date());
export const monthKey = s => s.slice(0, 7);
export const monthsBetween = (a, b) => {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};
export const isValidDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDay(s).getTime()) && toDay(parseDay(s)) === s;
