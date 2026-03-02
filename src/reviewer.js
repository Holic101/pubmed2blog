/**
 * Article Reviewer — checks drafts for AI-speak, fact accuracy, and brand voice
 */

import fs from 'fs'
import path from 'path'
import { callLLM } from './providers/index.js'
import * as config from './config.js'

const AI_SPEAK_PATTERNS = [
  /—/g,                                    // Em-dashes
  /es ist wichtig zu beachten/gi,
  /in der heutigen zeit/gi,
  /zusammenfassend l[äa]sst sich sagen/gi,
  /zweifellos/gi,
  /ohne zweifel/gi,
  /revolution[äa]r/gi,
  /bahnbrechend/gi,
  /game.?changer/gi,
  /nicht zu untersch[äa]tzen/gi,
  /it'?s worth noting/gi,
  /it'?s important to note/gi,
  /in today'?s world/gi,
  /in conclusion/gi,
  /undoubtedly/gi,
  /groundbreaking/gi,
  /cutting.?edge/gi,
  /paradigm shift/gi,
  /holistic/gi,
  /synerg/gi,
  /leverage/gi,
  /robust/gi,
  /comprehensive/gi,
  /delve/gi,
  /tapestry/gi,
  /landscape/gi,
  /realm/gi,
  /pivotal/gi,
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
