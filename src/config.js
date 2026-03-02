/**
 * Config manager - load/save/validate user configuration
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.pubmed2blog')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

/**
 * Load config from ~/.pubmed2blog/config.json
 */
export function load() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
    }
  } catch (err) {
    console.error('Error loading config:', err.message)
  }
  return null
}

/**
 * Save config to ~/.pubmed2blog/config.json
 */
export function save(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

/**
 * Validate API key with a test call
 */
export async function validateApiKey(provider, apiKey, model) {
  if (provider === 'anthropic') {
    const isOAT = apiKey && apiKey.startsWith('sk-ant-oat')
    const authHeaders = isOAT ? { Authorization: `Bearer ${apiKey}` } : { 'x-api-key': apiKey }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    })
    return res.ok
  } else if (provider === 'openai' || provider === 'zai') {
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
        model: model || (provider === 'zai' ? 'glm-4' : 'gpt-4o'),
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      }),
    })
    return res.ok
  }
  return false
}

/**
 * Get default model for provider
 */
export function getDefaultModel(provider) {
  const defaults = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    zai: 'glm-4-flash',
  }
  return defaults[provider] || 'claude-sonnet-4-20250514'
}
