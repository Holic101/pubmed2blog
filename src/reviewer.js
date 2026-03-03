/**
 * Article Reviewer — checks drafts for AI-speak, fact accuracy, and brand voice
 */

import fs from 'fs'
import path from 'path'
import { callLLM } from './providers/index.js'
import * as config from './config.js'

// Based on Ole Lehmann's Voice DNA banned phrases + custom additions
// Source: https://x.com/itsolelehmann/status/2028497454635888982
const AI_SPEAK_PATTERNS = [
  // === FORMATTING (FATAL) ===
  /—/g,                                    // Em-dashes — NEVER use

  // === Dead AI Language (DE + EN) ===
  /in der heutigen/gi,                     // "In der heutigen [Zeit/Welt]..."
  /in today'?s/gi,                         // "In today's [anything]..."
  /es ist wichtig zu beachten/gi,
  /es ist erw[äa]hnenswert/gi,
  /it'?s important to note/gi,
  /it'?s worth noting/gi,
  /delve/gi,
  /dive into/gi,
  /eintauchen/gi,
  /unpack/gi,
  /harness/gi,
  /leverage/gi,
  /utilize/gi,
  /landscape/gi,
  /realm/gi,
  /robust/gi,
  /game.?changer/gi,
  /cutting.?edge/gi,
  /straightforward/gi,
  /i'?d be happy to help/gi,
  /in order to/gi,
  /um zu(?:\s)/gi,                         // German "in order to" (when unnecessary)

  // === Dead Transitions ===
  /furthermore/gi,
  /additionally/gi,
  /moreover/gi,
  /dar[üu]ber hinaus/gi,                   // German "furthermore"
  /moving forward/gi,
  /at the end of the day/gi,
  /to put this in perspective/gi,
  /was dies besonders interessant macht/gi,
  /what makes this particularly interesting/gi,
  /die implikationen/gi,
  /the implications here/gi,
  /in other words/gi,
  /mit anderen worten/gi,
  /it goes without saying/gi,
  /es versteht sich von selbst/gi,
  /zusammenfassend l[äa]sst sich sagen/gi,

  // === Engagement Bait ===
  /let that sink in/gi,
  /read that again/gi,
  /full stop/gi,
  /this changes everything/gi,
  /dies [äa]ndert alles/gi,

  // === AI Cringe ===
  /supercharge/gi,
  /unlock/gi,
  /future.?proof/gi,
  /zukunftssicher/gi,
  /10x/gi,
  /the ai revolution/gi,
  /in the age of ai/gi,
  /im zeitalter der ki/gi,

  // === Generic Insider Claims ===
  /here'?s the part nobody/gi,
  /what nobody tells you/gi,
  /was niemand erz[äa]hlt/gi,
  /most people don'?t realize/gi,
  /die meisten wissen nicht/gi,

  // === The Big One (FATAL) — "Not X. This is Y." pattern ===
  /(?:this|das) isn'?t .{2,30}\. (?:this|das) is /gi,
  /(?:not|nicht) .{2,30}\. (?:sondern|but|rather) /gi,
  /forget .{2,30}\. this is /gi,
  /vergessen sie .{2,30}\. das ist /gi,
  /less .{2,15},\s*more /gi,
  /weniger .{2,15},\s*mehr /gi,

  // === Additional medical/science AI-isms ===
  /revolution[äa]r/gi,
  /bahnbrechend/gi,
  /zweifellos/gi,
  /ohne zweifel/gi,
  /undoubtedly/gi,
  /groundbreaking/gi,
  /paradigm shift/gi,
  /paradigmenwechsel/gi,
  /holistic/gi,
  /ganzheitlich/gi,                        // Only when used as filler
  /synerg/gi,
  /comprehensive/gi,
  /umfassend/gi,                           // When used as filler
  /tapestry/gi,
  /pivotal/gi,
  /entscheidend(?:e[rn]?)?\s+rolle/gi,     // "entscheidende Rolle" — often AI filler
  /nicht zu untersch[äa]tzen/gi,
  /navigat(e|ing)/gi,
]

const MEDICAL_CLAIM_PATTERNS = [
  /(?<!nicht? )(?:heilt?|cur(?:es?|ing))/gi,
  /(?<!nicht? )verhindert?(?! werden)/gi,
  /(?<!nicht? )(?:prevents?|preventing)/gi,
  /garantiert/gi,
  /(?:wirkt?|works?) gegen/gi,
  /bewiesen,? dass/gi,
  /proven to/gi,
]

/**
 * Review a single article file
 */
export async function reviewArticle(filePath, options = {}) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const issues = []

  // 1. AI-Speak Check (regex)
  for (const pattern of AI_SPEAK_PATTERNS) {
    const matches = content.match(pattern)
    if (matches) {
      issues.push({
        type: 'ai-speak',
        severity: 'warning',
        detail: `Found AI-speak pattern: "${matches[0]}" (${matches.length}x)`,
      })
    }
  }

  // 2. Medical Claims Check (regex)
  for (const pattern of MEDICAL_CLAIM_PATTERNS) {
    const matches = content.match(pattern)
    if (matches) {
      issues.push({
        type: 'medical-claim',
        severity: 'error',
        detail: `Potential medical claim: "${matches[0]}" (${matches.length}x)`,
      })
    }
  }

  // 3. LLM-based deep review (if API configured)
  const cfg = config.load()
  if (cfg?.apiKey && !options.skipLLM) {
    try {
      const llmReview = await callLLM(
        [{ role: 'user', content: `Review this healthcare blog article for quality:\n\n${content}` }],
        {
          ...cfg,
          system: `You are a medical content reviewer for YEARS, a premium longevity clinic in Berlin.

Review the article for:
1. FACTUAL ACCURACY: Do the cited numbers (HR, CI, p-values, sample sizes) seem plausible? Any red flags?
2. AI-SPEAK: Does the text sound like it was written by AI? Look for: overly smooth transitions, em-dashes, filler phrases, generic conclusions
3. MEDICAL CLAIMS: Any language that implies causation instead of association? Any health promises?
4. BRAND VOICE: Is the tone calm, precise, evidence-based? No hype, no sensationalism?
5. READABILITY: Is it accessible to an educated lay audience without dumbing down?

Respond in JSON format:
{
  "verdict": "pass" | "revise",
  "score": 1-10,
  "issues": [{"type": "...", "severity": "error|warning", "detail": "...", "suggestion": "..."}],
  "summary": "One paragraph overall assessment"
}`,
          maxTokens: 1500,
        }
      )

      try {
        const parsed = JSON.parse(llmReview.content)
        if (parsed.issues) issues.push(...parsed.issues)
        return {
          file: filePath,
          verdict: parsed.verdict || (issues.some(i => i.severity === 'error') ? 'revise' : 'pass'),
          score: parsed.score,
          issues,
          summary: parsed.summary,
          llmModel: llmReview.model,
        }
      } catch {
        // LLM didn't return valid JSON, use regex-only results
      }
    } catch (err) {
      console.error(`LLM review failed: ${err.message}`)
    }
  }

  // Regex-only verdict
  const hasErrors = issues.some(i => i.severity === 'error')
  return {
    file: filePath,
    verdict: hasErrors ? 'revise' : 'pass',
    score: hasErrors ? 3 : issues.length > 3 ? 5 : 7,
    issues,
    summary: `Regex review: ${issues.length} issues found (${issues.filter(i => i.severity === 'error').length} errors)`,
  }
}

/**
 * Review all articles in output/ and sort into approved/revision
 */
export async function reviewAll(outputDir = './output') {
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.md') && !f.startsWith('.'))
  const approvedDir = path.join(outputDir, 'approved')
  const revisionDir = path.join(outputDir, 'revision')

  if (!fs.existsSync(approvedDir)) fs.mkdirSync(approvedDir, { recursive: true })
  if (!fs.existsSync(revisionDir)) fs.mkdirSync(revisionDir, { recursive: true })

  const results = []
  for (const file of files) {
    const filePath = path.join(outputDir, file)
    console.log(`📝 Reviewing ${file}...`)
    const result = await reviewArticle(filePath)
    results.push(result)

    if (result.verdict === 'pass') {
      fs.renameSync(filePath, path.join(approvedDir, file))
      console.log(`   ✅ Approved (score: ${result.score}/10)`)
    } else {
      // Write feedback file
      const feedbackPath = path.join(revisionDir, file.replace('.md', '-feedback.json'))
      fs.writeFileSync(feedbackPath, JSON.stringify(result, null, 2))
      fs.renameSync(filePath, path.join(revisionDir, file))
      console.log(`   ❌ Needs revision (score: ${result.score}/10)`)
      result.issues.forEach(i => console.log(`      ${i.severity}: ${i.detail}`))
    }
  }
  return results
}
