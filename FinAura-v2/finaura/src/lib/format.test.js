import { describe, it, expect } from 'vitest'
import { makeMoney, pct, pctPlain } from './format.js'

describe('format', () => {
  it('formats INR compactly in lakh/crore', () => {
    const m = makeMoney('INR')
    expect(m.compact(150000)).toBe('₹1.50 L')
    expect(m.compact(25000000)).toBe('₹2.50 Cr')
    expect(m.compact(-4200)).toBe('−₹4.2k')
    expect(m.compact(950)).toBe('₹950')
  })
  it('formats USD compactly', () => {
    expect(makeMoney('USD').compact(2500000)).toBe('$2.50M')
  })
  it('formats percentages with sign', () => {
    expect(pct(0.0512)).toBe('+5.1%')
    expect(pct(-0.2)).toBe('−20.0%')
    expect(pctPlain(0.256)).toBe('26%')
  })
})
