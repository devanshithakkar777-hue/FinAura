/**
 * Optional LLM layer: rewrites the council's deterministic summary in plain language.
 * The deterministic result is always returned if the API key is missing or the call fails.
 */
export async function synthesizeCouncil(config, council, question, log) {
  if (!config.ANTHROPIC_API_KEY) return null;
  const payload = {
    question: question || 'Should I rebalance my portfolio?',
    consensus: council.moderator.consensus,
    agents: council.agents.map(a => ({ name: a.name, stance: a.stance, headline: a.headline, reasons: a.reasons.slice(0, 3), actions: a.actions })),
    dissent: council.moderator.dissent,
  };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: { 'content-type': 'application/json', 'x-api-key': config.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 400,
        system: 'You summarise a panel of four rule-based financial analysis agents for a retail investor. Use ONLY the facts in the JSON. '
          + 'Write 3-4 plain sentences. Mention any dissent honestly. Never tell the user to buy or sell a specific security, never promise returns, '
          + 'and end with: "This is educational analysis, not investment advice."',
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    });
    if (!res.ok) { log.warn({ status: res.status }, 'LLM synthesis failed'); return null; }
    const data = await res.json();
    const text = data?.content?.find?.(b => b.type === 'text')?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch (e) {
    log.warn({ err: e.message }, 'LLM synthesis error');
    return null;
  }
}
