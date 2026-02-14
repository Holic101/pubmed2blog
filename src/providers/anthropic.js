/**
 * Anthropic Claude provider
 */

export async function callAnthropic(messages, options) {
  const { apiKey, model = 'claude-sonnet-4-20250514' } = options

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens || 4000,
      messages,
      system: options.system,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return {
    content: data.content[0].text,
    usage: data.usage,
    model: data.model,
  }
}
