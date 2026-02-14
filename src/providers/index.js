/**
 * Provider detection and routing
 */

import { callAnthropic } from './anthropic.js'
import { callOpenAI } from './openai.js'

/**
 * Detect provider from model name
 */
export function detectProvider(model) {
  const m = model.toLowerCase()
  if (m.startsWith('claude')) return 'anthropic'
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return 'openai'
  if (m.startsWith('glm') || m.startsWith('zai')) return 'zai'
  return 'anthropic' // default
}

/**
 * Call LLM with auto-detected provider
 */
export async function callLLM(messages, options) {
  const { provider: configProvider, model, apiKey } = options

  // Auto-detect from model if not explicitly set
  let provider = configProvider
  if (!provider && model) {
    provider = detectProvider(model)
  }

  const opts = {
    apiKey,
    model: model || (provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
    maxTokens: options.maxTokens,
    system: options.system,
  }

  if (provider === 'anthropic') {
    return callAnthropic(messages, opts)
  } else {
    return callOpenAI(messages, { ...opts, provider })
  }
}
