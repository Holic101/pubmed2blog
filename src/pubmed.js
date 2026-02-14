/**
 * PubMed E-utilities API client
 * Handles search, fetch, and MeSH-enhanced queries
 */

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const PMC_BASE = 'https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { XMLParser } from 'fast-xml-parser'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Load config files */
function loadJournals() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../config/journals.json'), 'utf-8'))
  } catch {
    return { tier1: { journals: [] }, tier2: { journals: [] }, tier3: { journals: [] } }
  }
}

function loadMeshFilters() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../config/mesh-filters.json'), 'utf-8'))
  } catch {
    return { keywords: {} }
  }
}

const JOURNALS = loadJournals()
const MESH_FILTERS = loadMeshFilters()

/** Sleep helper */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Build a PubMed search query with MeSH terms, journal filters, and keyword config
 */
export function buildQuery(keyword, options = {}) {
  const {
    journalTier = 'tier1,tier2',
    days = 90,
    useMesh = true,
    studyType = 'individual',
  } = options

  const parts = []

  // 1. Keyword search
  const kwConfig = MESH_FILTERS.keywords?.[keyword]
  if (kwConfig) {
    parts.push(`(${kwConfig.search})`)
  } else {
    parts.push(`(${keyword}[Title/Abstract])`)
  }

  // 2. MeSH longevity/aging relevance layer
  if (useMesh && MESH_FILTERS.longevity_core) {
    const meshTerms = MESH_FILTERS.longevity_core.terms
      .map((t) => `"${t}"[MeSH]`)
      .join(' OR ')
    const freetextTerms = MESH_FILTERS.longevity_core.freetext_fallback
      .map((t) => `"${t}"[tiab]`)
      .join(' OR ')
    parts.push(`(${meshTerms} OR ${freetextTerms})`)
  }

  // 3. Add keyword-specific MeSH boost
  if (useMesh && kwConfig?.mesh_boost) {
    const boostTerms = kwConfig.mesh_boost
      .map((t) => `"${t}"[MeSH]`)
      .join(' OR ')
    parts.push(`(${boostTerms})`)
  }

  // 4. Journal filter
  const tiers = journalTier.split(',').map((t) => t.trim())
  const journalNames = []
  for (const tier of tiers) {
    if (JOURNALS[tier]) {
      journalNames.push(...JOURNALS[tier].journals)
    }
  }
  if (journalNames.length > 0) {
    const journalFilter = journalNames
      .map((j) => `"${j}"[Journal]`)
      .join(' OR ')
    parts.push(`(${journalFilter})`)
  }

  // 5. Date filter
  const now = new Date()
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const minDate = `${from.getFullYear()}/${String(from.getMonth() + 1).padStart(2, '0')}/${String(from.getDate()).padStart(2, '0')}`
  const maxDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`

  // 6. Study type filter
  if (studyType === 'individual') {
    parts.push('NOT ("Meta-Analysis"[pt] OR "Systematic Review"[pt])')
  } else if (studyType === 'meta') {
    parts.push('("Meta-Analysis"[pt] OR "Systematic Review"[pt])')
  }

  // 7. Humans only
  parts.push('"humans"[MeSH]')

  const query = parts.join(' AND ')

  return { query, minDate, maxDate }
}

/**
 * Search PubMed and return PMIDs
 */
export async function search(keyword, options = {}) {
  const { retmax = 20, ...rest } = options
  const { query, minDate, maxDate } = buildQuery(keyword, rest)

  const params = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmax: String(retmax),
    mindate: minDate,
    maxdate: maxDate,
    retmode: 'json',
    sort: 'relevance',
  })

  console.log(`\n🔍 PubMed Query:\n${query}\n`)
  console.log(`📅 Date range: ${minDate} — ${maxDate}`)

  const res = await fetch(`${BASE}/esearch.fcgi?${params}`)
  const data = await res.json()

  const result = data.esearchresult
  const count = parseInt(result.count, 10)
  const ids = result.idlist || []

  console.log(`📊 Found: ${count} results (returning top ${ids.length})`)

  return { count, ids, query }
}

/**
 * Fetch article details (abstract, authors, journal, date) for given PMIDs
 */
export async function fetchArticles(pmids) {
  if (pmids.length === 0) return []

  await sleep(350) // Rate limit

  const res = await fetch(
    `${BASE}/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml&rettype=abstract`
  )
  const xml = await res.text()

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) =>
      ['PubmedArticle', 'Author', 'Keyword', 'MeshHeading', 'AbstractText'].includes(name),
  })
  const parsed = parser.parse(xml)

  const articles = []
  const pubmedArticles = parsed?.PubmedArticleSet?.PubmedArticle || []

  for (const art of pubmedArticles) {
    const citation = art.MedlineCitation
    const article = citation?.Article
    if (!article) continue

    const pmid = citation.PMID?.['#text'] || citation.PMID

    // Journal
    const journal = article.Journal?.ISOAbbreviation || article.Journal?.Title || 'Unknown'

    // Title
    const title =
      typeof article.ArticleTitle === 'string'
        ? article.ArticleTitle
        : article.ArticleTitle?.['#text'] || ''

    // Date
    const pubDate = article.Journal?.JournalIssue?.PubDate
    const year = pubDate?.Year || ''
    const month = pubDate?.Month || ''
    const day = pubDate?.Day || ''
    const dateStr = [year, month, day].filter(Boolean).join(' ')

    // Authors
    const authorList = article.AuthorList?.Author || []
    const authors = authorList.slice(0, 3).map((a) => {
      return `${a.LastName || ''} ${a.Initials || ''}`.trim()
    })
    const authorStr =
      authors.length > 0
        ? authorList.length > 3
          ? `${authors.join(', ')} et al.`
          : authors.join(', ')
        : 'Unknown'

    // Abstract
    const abstractTexts = article.Abstract?.AbstractText || []
    let abstract = ''
    if (Array.isArray(abstractTexts)) {
      abstract = abstractTexts
        .map((t) => {
          if (typeof t === 'string') return t
          const label = t['@_Label'] || t['@_NlmCategory'] || ''
          const text = t['#text'] || ''
          return label ? `**${label}:** ${text}` : text
        })
        .join('\n\n')
    } else if (typeof abstractTexts === 'string') {
      abstract = abstractTexts
    }

    // DOI
    const elocations = article.ELocationID
    let doi = ''
    if (Array.isArray(elocations)) {
      const doiLoc = elocations.find((e) => e['@_EIdType'] === 'doi')
      doi = doiLoc?.['#text'] || ''
    } else if (elocations?.['@_EIdType'] === 'doi') {
      doi = elocations['#text'] || ''
    }

    // Publication type
    const pubTypes = article.PublicationTypeList?.PublicationType || []
    const types = (Array.isArray(pubTypes) ? pubTypes : [pubTypes])
      .map((t) => (typeof t === 'string' ? t : t['#text'] || ''))
      .filter(Boolean)

    // Keywords
    const kwList = citation.KeywordList?.Keyword || []
    const keywords = (Array.isArray(kwList) ? kwList : [kwList])
      .map((k) => (typeof k === 'string' ? k : k['#text'] || ''))
      .filter(Boolean)

    // MeSH terms
    const meshList = citation.MeshHeadingList?.MeshHeading || []
    const meshTerms = meshList
      .map((m) => {
        const desc = m.DescriptorName
        return typeof desc === 'string' ? desc : desc?.['#text'] || ''
      })
      .filter(Boolean)

    articles.push({
      pmid: String(pmid),
      title: cleanXmlText(title),
      journal,
      date: dateStr,
      authors: authorStr,
      abstract: cleanXmlText(abstract),
      doi,
      types,
      keywords,
      meshTerms,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    })
  }

  return articles
}

/**
 * Score article relevance for blog
 */
export function scoreArticle(article) {
  let score = 0
  const reasons = []

  // Journal tier scoring
  const jName = article.journal
  if (JOURNALS.tier1?.journals?.some((j) => jName.includes(j) || j.includes(jName))) {
    score += 30
    reasons.push('Tier 1 journal (+30)')
  } else if (JOURNALS.tier2?.journals?.some((j) => jName.includes(j) || j.includes(jName))) {
    score += 20
    reasons.push('Tier 2 journal (+20)')
  } else if (JOURNALS.tier3?.journals?.some((j) => jName.includes(j) || j.includes(jName))) {
    score += 10
    reasons.push('Tier 3 journal (+10)')
  }

  // Study type scoring
  const typeStr = article.types.join(' ').toLowerCase()
  if (typeStr.includes('randomized controlled trial')) {
    score += 25
    reasons.push('RCT (+25)')
  } else if (typeStr.includes('clinical trial')) {
    score += 20
    reasons.push('Clinical trial (+20)')
  } else if (typeStr.includes('observational') || typeStr.includes('cohort')) {
    score += 15
    reasons.push('Cohort/Observational (+15)')
  } else if (typeStr.includes('meta-analysis') || typeStr.includes('systematic review')) {
    score += 5
    reasons.push('Meta-analysis/Review (+5)')
  } else {
    score += 10
    reasons.push('Other study type (+10)')
  }

  // Sample size heuristic
  const sampleMatch = article.abstract.match(
    /(\d{1,3}(?:,\d{3})+|\d{4,})\s*(?:participants|patients|subjects|individuals|adults|men|women|people)/i
  )
  if (sampleMatch) {
    const n = parseInt(sampleMatch[1].replace(/,/g, ''), 10)
    if (n >= 10000) {
      score += 20
      reasons.push(`Large sample n=${n.toLocaleString()} (+20)`)
    } else if (n >= 1000) {
      score += 15
      reasons.push(`Good sample n=${n.toLocaleString()} (+15)`)
    } else if (n >= 100) {
      score += 10
      reasons.push(`Moderate sample n=${n.toLocaleString()} (+10)`)
    }
  }

  // Novelty signals
  const noveltyTerms = ['first', 'novel', 'new', 'emerging', 'previously unknown', 'paradigm', 'breakthrough']
  for (const term of noveltyTerms) {
    if (
      article.title.toLowerCase().includes(term) ||
      article.abstract.toLowerCase().includes(term)
    ) {
      score += 5
      reasons.push(`Novelty signal: "${term}" (+5)`)
      break
    }
  }

  // Actionable findings
  const actionableTerms = [
    'recommendation',
    'clinical practice',
    'guideline',
    'intervention',
    'treatment',
    'prevention',
  ]
  for (const term of actionableTerms) {
    if (article.abstract.toLowerCase().includes(term)) {
      score += 5
      reasons.push(`Actionable: "${term}" (+5)`)
      break
    }
  }

  // Has full abstract
  if (article.abstract.length > 200) {
    score += 5
    reasons.push('Has substantial abstract (+5)')
  }

  return { score, reasons }
}

/** Remove XML entities and tags from text */
function cleanXmlText(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&#x[0-9a-fA-F]+;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Discover: search + fetch + score + rank
 */
export async function discover(keyword, options = {}, config) {
  // Search
  const { ids } = await search(keyword, options)

  if (ids.length === 0) {
    console.log('\n❌ No results found. Try broader search terms or longer date range.')

    // Fallback: try without MeSH filter
    if (options.useMesh !== false) {
      console.log('\n🔄 Retrying without MeSH filter...')
      return discover(keyword, { ...options, useMesh: false }, config)
    }

    // Fallback: try without journal filter
    if (options.journalTier) {
      console.log('\n🔄 Retrying without journal filter...')
      return discover(keyword, { ...options, useMesh: false, journalTier: '' }, config)
    }

    return []
  }

  // Fetch details
  console.log(`\n📄 Fetching article details...`)
  const articles = await fetchArticles(ids)

  // Score and rank
  const scored = articles.map((art) => {
    const { score, reasons } = scoreArticle(art)
    return { ...art, score, scoreReasons: reasons }
  })

  scored.sort((a, b) => b.score - a.score)

  // Output
  console.log('\n📋 Results (ranked by blog suitability):\n')
  scored.forEach((art, i) => {
    console.log(`${i + 1}. [${art.score} pts] ${art.title.slice(0, 60)}...`)
    console.log(`   Journal: ${art.journal} | Date: ${art.date} | PMID: ${art.pmid}`)
    console.log(`   Score: ${art.scoreReasons.join(', ')}\n`)
  })

  console.log('\n💡 Next step:')
  console.log('   pubmed2blog extract <pmid>   # Get full paper details')
  console.log('   pubmed2blog generate <pmid> # Generate blog article\n')

  return scored
}

/**
 * List available keywords
 */
export function listKeywords() {
  return Object.keys(MESH_FILTERS.keywords || {})
}
