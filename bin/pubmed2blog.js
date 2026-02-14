#!/usr/bin/env node

import { program } from 'commander'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { init } from '../src/init.js'
import * as config from '../src/config.js'
import { discover } from '../src/pubmed.js'
import { extract } from '../src/fulltext.js'
import { generate } from '../src/generator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

program
  .name('pubmed2blog')
  .description('Transform PubMed papers into SEO-optimized healthcare blog articles')
  .version('1.0.0')

// init command
program
  .command('init')
  .description('Interactive onboarding to configure API keys, brand voice, and preferences')
  .action(async () => {
    await init()
  })

// discover command
program
  .command('discover <keyword>')
  .description('Search PubMed for relevant studies and rank by blog suitability')
  .option('-d, --days <number>', 'Days to search back (default: 90)', '90')
  .option('-t, --tier <tiers>', 'Journal tiers to include (comma-separated, default: tier1,tier2)', 'tier1,tier2')
  .option('-l, --limit <number>', 'Max results (default: 20)', '20')
  .option('-s, --study-type <type>', 'Study type filter: individual, meta, any', 'any')
  .option('-j, --json', 'Output as JSON')
  .option('-S, --save', 'Save results to file')
  .action(async (keyword, options) => {
    const cfg = config.load()
    if (!cfg) {
      console.error('Run pubmed2blog init first')
      process.exit(1)
    }
    await discover(keyword, options, cfg)
  })

// extract command
program
  .command('extract <pmid>')
  .description('Fetch full paper details from PubMed')
  .option('-j, --json', 'Output as JSON')
  .option('-S, --save', 'Save to file')
  .action(async (pmid, options) => {
    const cfg = config.load()
    if (!cfg) {
      console.error('Run pubmed2blog init first')
      process.exit(1)
    }
    await extract(pmid, options, cfg)
  })

// generate command
program
  .command('generate <pmid>')
  .description('Generate a blog article from a PubMed paper')
  .option('-t, --type <type>', 'Article type: research-explainer, patient-facing, differentiation, service-connection', 'research-explainer')
  .option('-l, --lang <languages>', 'Languages (comma-separated, default from config)', '')
  .option('-m, --model <model>', 'LLM model (default from config)', '')
  .option('-S, --save', 'Save article to file')
  .action(async (pmid, options) => {
    const cfg = config.load()
    if (!cfg) {
      console.error('Run pubmed2blog init first')
      process.exit(1)
    }
    await generate(pmid, options, cfg)
  })

// pipeline command
program
  .command('pipeline <keyword>')
  .description('Full pipeline: discover + extract + generate')
  .option('-n, --top <number>', 'Number of papers to process (default: 1)', '1')
  .option('-t, --type <type>', 'Article type', 'research-explainer')
  .option('-S, --save', 'Save all outputs')
  .action(async (keyword, options) => {
    const cfg = config.load()
    if (!cfg) {
      console.error('Run pubmed2blog init first')
      process.exit(1)
    }
    
    console.log('\n🔍 Step 1: Discovering papers...\n')
    const results = await discover(keyword, { ...options, limit: options.top }, cfg)
    
    const topPapers = results.slice(0, parseInt(options.top))
    
    for (const paper of topPapers) {
      console.log(`\n📄 Step 2: Extracting ${paper.pmid}...\n`)
      await extract(paper.pmid, { json: options.json }, cfg)
      
      console.log(`\n✍️ Step 3: Generating article...\n`)
      await generate(paper.pmid, { ...options, type: options.type }, cfg)
    }
    
    console.log('\n✅ Pipeline complete!\n')
  })

// config command
program
  .command('config')
  .description('Show current configuration (API keys redacted)')
  .action(() => {
    const cfg = config.load()
    if (!cfg) {
      console.log('No config found. Run pubmed2blog init')
      return
    }
    const safe = { ...cfg }
    if (safe.apiKey) safe.apiKey = safe.apiKey.replace(/(.{4}).+(.{4})/, '$1••••••$2')
    console.log(JSON.stringify(safe, null, 2))
  })

// keywords command
program
  .command('keywords')
  .description('List configured keywords (from mesh-filters)')
  .action(() => {
    try {
      const filters = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/mesh-filters.json'), 'utf-8'))
      console.log('Available keyword categories:')
      Object.keys(filters).forEach(cat => console.log(`  - ${cat}`))
    } catch {
      console.log('No mesh-filters.json found')
    }
  })

// types command
program
  .command('types')
  .description('List article types with descriptions')
  .action(() => {
    try {
      const types = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/article-types.json'), 'utf-8'))
      console.log('Available article types:')
      Object.entries(types).forEach(([key, val]) => {
        console.log(`\n  ${key}:`)
        console.log(`    ${val.description}`)
      })
    } catch {
      console.log('No article-types.json found')
    }
  })

program.parse()
