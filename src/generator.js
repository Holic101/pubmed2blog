/**
 * Blog article generator
 * Takes extracted paper data and produces blog articles
 */

import { callLLM, detectProvider } from './providers/index.js'
import fs from 'fs'
import path from 'path'

const ARTICLE_TYPES = {
  'research-explainer': {
    name: 'Research Explainer',
    description: 'Study findings for educated lay audience. Lead with surprising finding. Numbers with explanations. Limitations mandatory. Actionable takeaways.',
    prompt: `You are a medical science writer creating content for a healthcare blog.

Write a blog article explaining this study for an educated lay audience.

RULES:
- Lead with the surprising/newsworthy finding, not the methodology
- Use concrete numbers (HR, CI, sample size) but explain what they mean
- Include a "Limitations" section — never hide weaknesses
- NO health claims, NO promises, NO "this will cure/prevent X"
- Use association language ("associated with", "linked to"), NEVER causal ("causes", "prevents")
- End with actionable takeaways (measure, understand, talk to your doctor)
- Tone: evidence-first, serious but accessible, no hype
- Include full references at the end

STRUCTURE:
1. Hook (surprising finding, 2-3 sentences)
2. What was studied (1 paragraph)
3. Key findings (with numbers)
4. What this means for you (interpretation)
5. Important limitations
6. What you can do (actionable)
7. References`,
  },
  'patient-facing': {
    name: 'Patient-Facing',
    description: 'Accessible, scenario-based, no jargon. Short paragraphs. Bottom Line with 3 bullets.',
    prompt: `You are writing healthcare content for a general audience. Your reader is a busy professional who cares about health but isn't a doctor.

Write a patient-friendly article based on this study.

RULES:
- No jargon — explain every medical term on first use
- Use analogies and everyday comparisons
- Focus on "what does this mean for MY health?"
- NO health claims, NO direct product promotion
- Keep paragraphs short (3-4 sentences max)
- Include a clear "Bottom Line" section

STRUCTURE:
1. Relatable opening (a scenario or question the reader has)
2. The study in plain language
3. The key numbers, explained simply
4. "What does this mean for you?"
5. Bottom line (3 bullet points)
6. References`,
  },
  'differentiation': {
    name: 'Differentiation',
    description: '"Why we don\'t offer X." Acknowledge hype. Pro + contra evidence. Evidence standards.',
    prompt: `You are writing for a healthcare provider that prides itself on evidence-based decisions.

Write a "Why we don't offer [treatment]" article based on this research.

RULES:
- Acknowledge the hype fairly — don't dismiss, explain
- Present pro AND contra arguments with evidence levels
- Explain your evidence standard (Level 2+: randomized, placebo-controlled)
- Show that "not offering X" is a sign of HIGH standards, not ignorance
- NO claims about what treatments DO
- Tone: respectful, scientific, transparent
- End with "what we focus on instead" (1-2 sentences, general category only)

STRUCTURE:
1. "You've probably heard about [treatment]"
2. What the evidence says (pro)
3. What the evidence says (contra/gaps)
4. Our evidence standard and decision
5. What we focus on instead
6. References`,
  },
  'service-connection': {
    name: 'Service Connection',
    description: '80% science, 20% relevance. Study first. Educational.',
    prompt: `You are writing for a preventive medicine clinic.

Write an article that connects this study's findings to the broader concept of preventive health assessment.

RULES:
- The study comes first — this is NOT a sales page
- 80% science, 20% relevance to preventive medicine
- Describe what assessments EXIST, never claim outcomes
- Include the full study details with numbers
- Limitations section mandatory

STRUCTURE:
1. The study and why it matters
2. Key findings
3. What this means for preventive medicine (general)
4. How this type of assessment works (educational)
5. Limitations
6. References`,
  },
}

/**
 * Generate a blog article from paper data
 */
export async function generate(pmid, options, config) {
  console.log(`\n✍️ Generating article for PMID ${pmid}...\n`)

  // Fetch paper details
  const { fetchArticles } = await import('./pubmed.js')
  const articles = await fetchArticles([pmid])

  if (articles.length === 0) {
    console.log(`❌ Paper ${pmid} not found`)
    return null
  }

  const paper = articles[0]
  const articleType = options.type || config.defaultArticleType || 'research-explainer'
  const typeConfig = ARTICLE_TYPES[articleType]

  if (!typeConfig) {
    console.log(`❌ Unknown article type: ${articleType}`)
    console.log(`Available: ${Object.keys(ARTICLE_TYPES).join(', ')}`)
    return null
  }

  // Determine languages
  const languages = options.lang
    ? options.lang.split(',')
    : config.languages || ['en']

  // Override model if specified
  const model = options.model || config.model

  // Detect provider
  const provider = config.provider || detectProvider(model)

  const results = {}

  for (const lang of languages) {
    const langInstructions =
      lang === 'de'
        ? '\n\nWrite in German (Deutsch). Use formal but accessible language.'
        : '\n\nWrite in English.'

    const paperContext = `
PAPER DETAILS:
- Title: ${paper.title}
- Authors: ${paper.authors}
- Journal: ${paper.journal}
- Date: ${paper.date}
- PMID: ${paper.pmid}
- DOI: ${paper.doi || 'Not available'}
- Publication Types: ${paper.types.join(', ')}
- Keywords: ${paper.keywords.join(', ')}
- MeSH Terms: ${paper.meshTerms.join(', ')}

ABSTRACT:
${paper.abstract}
`

    const systemPrompt = typeConfig.prompt + langInstructions
    const userMessage = `Generate a blog article based on this paper:\n\n${paperContext}`

    console.log(`🔄 Generating ${lang.toUpperCase()} article via ${provider}...`)

    try {
      const response = await callLLM(
        [{ role: 'user', content: userMessage }],
        {
          provider,
          apiKey: config.apiKey,
          model,
          system: systemPrompt,
        }
      )

      const { content, usage } = response
      console.log(
        `   ✅ ${lang.toUpperCase()}: ${content.length} chars, ${usage?.input_tokens || '?'}+${usage?.output_tokens || '?'} tokens`
      )

      results[lang] = {
        content,
        usage,
        type: typeConfig.name,
      }

      // Save if requested
      if (options.save) {
        const outputDir = config.outputDir || './output'
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true })
        }

        const frontmatter = `---
title: "${paper.title.replace(/"/g, '\\"')}"
pmid: ${paper.pmid}
doi: ${paper.doi || ''}
journal: "${paper.journal}"
date: "${paper.date}"
authors: "${paper.authors}"
article_type: "${articleType}"
language: "${lang}"
generated: "${new Date().toISOString()}"
generator: "pubmed2blog v1.0.0"
---

`

        const filename = `${outputDir}/${pmid}-${lang}.md`
        fs.writeFileSync(filename, frontmatter + content)
        console.log(`   💾 Saved to ${filename}`)
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`)
    }
  }

  return results
}

/**
 * List available article types
 */
export function listArticleTypes() {
  return Object.entries(ARTICLE_TYPES).map(([key, val]) => ({
    key,
    name: val.name,
    description: val.description,
  }))
}
