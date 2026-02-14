/**
 * Interactive onboarding flow
 * Configures API keys, brand voice, and preferences
 */

import enquirer from 'enquirer'
const { Prompt } = enquirer
import fs from 'fs'
import path from 'path'
import os from 'os'
import { save, validateApiKey, getDefaultModel } from './config.js'

const CONFIG_DIR = path.join(os.homedir(), '.pubmed2blog')

/**
 * Run interactive onboarding
 */
export async function init() {
  console.log('\n🔬 pubmed2blog — Setup\n')

  // Provider selection
  const providerPrompt = new Prompt({
    type: 'select',
    name: 'provider',
    message: 'Choose your LLM provider:',
    choices: [
      { name: 'anthropic', message: 'Anthropic (Claude)' },
      { name: 'openai', message: 'OpenAI (GPT)' },
      { name: 'zai', message: 'Z.AI (GLM)' },
    ],
  })

  const { provider } = await providerPrompt.run()

  // API key
  const apiKeyPrompt = new Prompt({
    type: 'input',
    name: 'apiKey',
    message: `Enter your ${provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : 'Z.AI'} API key:`,
    validate: (input) => input.length > 10 || 'Please enter a valid API key',
  })

  const { apiKey } = await apiKeyPrompt.run()

  // Validate API key
  console.log('🔄 Validating API key...')
  const model = getDefaultModel(provider)
  const isValid = await validateApiKey(provider, apiKey, model)

  if (!isValid) {
    console.log('❌ Invalid API key. Please check and try again.')
    process.exit(1)
  }
  console.log('✅ API key validated\n')

  // Language selection
  const langPrompt = new Prompt({
    type: 'select',
    name: 'language',
    message: 'Default language(s) for articles:',
    choices: [
      { name: 'en', message: 'English only' },
      { name: 'de', message: 'German only' },
      { name: 'en,de', message: 'Both (English + German)' },
    ],
  })

  const { language } = await langPrompt.run()

  // Brand voice
  const voicePrompt = new Prompt({
    type: 'select',
    name: 'brandVoiceType',
    message: 'Brand Voice — How should articles sound?',
    choices: [
      { name: 'text', message: 'Enter text directly' },
      { name: 'file', message: 'Load from .md file' },
      { name: 'skip', message: 'Skip (use default medical tone)' },
    ],
  })

  const { brandVoiceType } = await voicePrompt.run()

  let brandVoice = ''
  let brandVoicePath = null

  if (brandVoiceType === 'text') {
    const textPrompt = new Prompt({
      type: 'input',
      name: 'brandVoice',
      message: 'Describe your brand voice (tone, audience, style):',
    })
    const result = await textPrompt.run()
    brandVoice = result.brandVoice
  } else if (brandVoiceType === 'file') {
    const filePrompt = new Prompt({
      type: 'input',
      name: 'brandVoicePath',
      message: 'Path to brand voice .md file:',
      validate: (input) => fs.existsSync(input) || 'File not found',
    })
    const result = await filePrompt.run()
    brandVoicePath = result.brandVoicePath
    brandVoice = fs.readFileSync(brandVoicePath, 'utf-8')
  }

  // Default article type
  const typePrompt = new Prompt({
    type: 'select',
    name: 'articleType',
    message: 'Default article type:',
    choices: [
      { name: 'research-explainer', message: 'Research Explainer' },
      { name: 'patient-facing', message: 'Patient-Facing' },
      { name: 'differentiation', message: 'Differentiation' },
      { name: 'service-connection', message: 'Service Connection' },
    ],
  })

  const { articleType } = await typePrompt.run()

  // Build config
  const config = {
    provider,
    apiKey,
    model,
    languages: language.split(','),
    brandVoice,
    brandVoicePath,
    journalTiers: ['tier1', 'tier2'],
    defaultArticleType: articleType,
    outputDir: './output',
    createdAt: new Date().toISOString(),
  }

  // Save
  save(config)
  console.log('\n✅ Config saved to ~/.pubmed2blog/config.json\n')

  // Create example brand voice file if skipped
  if (!brandVoice) {
    const examplePath = path.join(CONFIG_DIR, 'brand-voice-example.md')
    const exampleContent = `# Brand Voice Example

We are a preventive medicine clinic focused on evidence-based health optimization.

## Tone
- Professional but accessible
- Science-backed, not sensational
- Empathetic and supportive

## Audience
- Health-conscious individuals
- Patients seeking preventive care
- People interested in longevity

## Style
- Clear explanations of complex topics
- Numbers with context
- Actionable takeaways
- Honest about limitations
`
    fs.writeFileSync(examplePath, exampleContent)
    console.log(`📄 Created example brand voice: ${examplePath}\n`)
  }

  console.log('Get started:')
  console.log('  pubmed2blog discover "cardiovascular prevention"')
  console.log('  pubmed2blog pipeline "sleep quality" --save\n')
}
