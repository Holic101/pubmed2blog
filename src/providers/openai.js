/**
 * OpenAI provider (also handles Z.AI which has compatible API)
 */

export async function callOpenAI(messages, options) {
  const { apiKey, model = 'gpt-4o', provider = 'openai' } = options

  const endpoint =
    provider === 'zai'
      ? 'https://api.z.ai/api/coding/paas/v4/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: options.system },
        ...messages,
      ],
      max_tokens: options.maxTokens || 4000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${provider === 'zai' ? 'Z.AI' : 'OpenAI'} API error: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return {
    content: data.choices[0].message.content,
    usage: data.usage,
    model: data.model,
  }
}
