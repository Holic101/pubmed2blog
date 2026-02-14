/**
 * Full text fetcher - multi-source retrieval
 * Priority: PMC → Unpaywall → Europe PMC → OpenAlex
 */

const PMC_BASE = 'https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Convert HTML to readable text */
function htmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, '\n## $2\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x[0-9a-fA-F]+;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Try to get full text for an article via multiple sources
 */
export async function fetchFullText(pmid, doi) {
  const sources = []

  // 1. Try PMC (free, official)
  try {
    const convRes = await fetch(`${PMC_BASE}?ids=${pmid}&format=json`)
    const convData = await convRes.json()
    const record = convData?.records?.[0]
    const pmcid = record?.pmcid

    if (pmcid) {
      const ftRes = await fetch(`https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`, {
        headers: { Accept: 'text/html' },
      })

      if (ftRes.ok) {
        const html = await ftRes.text()
        const text = htmlToText(html)
        if (text.length > 500) {
          return { available: true, source: 'PMC', pmcid, text: text.slice(0, 50000) }
        }
      }
    }
  } catch (err) {
    sources.push({ source: 'PMC', error: err.message })
  }

  // 2. Try Unpaywall
  if (doi) {
    try {
      await sleep(100)
      const upRes = await fetch(
        `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=pubmed2blog@example.com`
      )
      if (upRes.ok) {
        const upData = await upRes.json()

        const oaLocations = upData.oa_locations || []
        const bestOA = oaLocations.find((l) => l.url_for_pdf) || oaLocations.find((l) => l.url_for_landing_page)

        if (bestOA) {
          const oaUrl = bestOA.url_for_pdf || bestOA.url_for_landing_page
          console.log(`   📗 Unpaywall: Found OA version (${bestOA.host_type})`)

          try {
            const oaRes = await fetch(oaUrl, {
              headers: { Accept: 'text/html', 'User-Agent': 'PubMed2Blog/1.0' },
              redirect: 'follow',
            })
            if (oaRes.ok) {
              const contentType = oaRes.headers.get('content-type') || ''

              if (contentType.includes('html')) {
                const html = await oaRes.text()
                const text = htmlToText(html)
                if (text.length > 500) {
                  return { available: true, source: `Unpaywall/${bestOA.host_type}`, text: text.slice(0, 50000) }
                }
              } else if (contentType.includes('pdf')) {
                return { available: false, source: 'Unpaywall/PDF', pdfUrl: oaUrl, text: null }
              }
            }
          } catch (fetchErr) {
            sources.push({ source: 'Unpaywall/fetch', error: fetchErr.message })
          }
        } else if (upData.is_oa === false) {
          console.log(`   🔒 Unpaywall: Paper is NOT open access`)
        }
      }
    } catch (err) {
      sources.push({ source: 'Unpaywall', error: err.message })
    }
  }

  // 3. Try Europe PMC
  try {
    await sleep(100)
    const euRes = await fetch(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:${pmid}&resultType=core&format=json`
    )
    if (euRes.ok) {
      const euData = await euRes.json()
      const result = euData.resultList?.result?.[0]
      if (result?.fullTextUrlList?.fullTextUrl) {
        const ftUrls = result.fullTextUrlList.fullTextUrl
        const htmlUrl = ftUrls.find((u) => u.documentStyle === 'html' && u.availabilityCode === 'OA')
        if (htmlUrl) {
          console.log(`   📗 Europe PMC: Found OA full text`)
          try {
            const htmlRes = await fetch(htmlUrl.url)
            if (htmlRes.ok) {
              const html = await htmlRes.text()
              const text = htmlToText(html)
              if (text.length > 500) {
                return { available: true, source: 'EuropePMC', text: text.slice(0, 50000) }
              }
            }
          } catch (fetchErr) {
            sources.push({ source: 'EuropePMC/fetch', error: fetchErr.message })
          }
        }
      }
    }
  } catch (err) {
    sources.push({ source: 'EuropePMC', error: err.message })
  }

  // 4. Try OpenAlex
  if (doi) {
    try {
      await sleep(100)
      const preprintRes = await fetch(`https://api.openalex.org/works/doi:${doi}`, {
        'User-Agent': 'PubMed2Blog/1.0',
      })
      if (preprintRes.ok) {
        const oaData = await preprintRes.json()
        const bestOA = oaData.best_oa_location
        if (bestOA?.pdf_url || bestOA?.landing_page_url) {
          const url = bestOA.landing_page_url || bestOA.pdf_url
          console.log(`   📗 OpenAlex: Found OA at ${bestOA.source?.display_name || url}`)
          try {
            const oaRes = await fetch(url, {
              headers: { Accept: 'text/html', 'User-Agent': 'PubMed2Blog/1.0' },
              redirect: 'follow',
            })
            if (oaRes.ok && (oaRes.headers.get('content-type') || '').includes('html')) {
              const html = await oaRes.text()
              const text = htmlToText(html)
              if (text.length > 500) {
                return {
                  available: true,
                  source: `OpenAlex/${bestOA.source?.display_name || 'OA'}`,
                  text: text.slice(0, 50000),
                }
              }
            }
          } catch (fetchErr) {
            sources.push({ source: 'OpenAlex/fetch', error: fetchErr.message })
          }
        }
      }
    } catch (err) {
      sources.push({ source: 'OpenAlex', error: err.message })
    }
  }

  return { available: false, pmcid: null, text: null, triedSources: sources }
}

/**
 * Extract paper details (wrapper for CLI)
 */
export async function extract(pmid, options, config) {
  console.log(`\n📄 Fetching paper ${pmid}...\n`)

  // Fetch basic details from PubMed
  const { fetchArticles } = await import('./pubmed.js')
  const articles = await fetchArticles([pmid])

  if (articles.length === 0) {
    console.log(`❌ Paper ${pmid} not found`)
    return null
  }

  const article = articles[0]
  console.log(`Title: ${article.title}`)
  console.log(`Journal: ${article.journal}`)
  console.log(`Date: ${article.date}`)
  console.log(`Authors: ${article.authors}`)
  console.log(`DOI: ${article.doi || 'N/A'}`)
  console.log(`URL: ${article.url}`)

  // Try to get full text
  console.log(`\n🔎 Checking full text availability...`)
  const fullText = await fetchFullText(pmid, article.doi)

  if (fullText.available) {
    console.log(`✅ Full text available from: ${fullText.source}`)
    article.fullText = fullText.text
    article.fullTextSource = fullText.source
  } else {
    console.log(`⚠️ No full text available (abstract only)`)
    if (fullText.triedSources?.length > 0) {
      console.log(`   Tried: ${fullText.triedSources.map((s) => s.source).join(', ')}`)
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(article, null, 2))
  } else {
    console.log(`\n📝 Abstract:\n${article.abstract.slice(0, 500)}...`)
  }

  // Save if requested
  if (options.save) {
    const fs = await import('fs')
    const outputDir = './output'
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    const filename = `${outputDir}/${pmid}.json`
    fs.writeFileSync(filename, JSON.stringify(article, null, 2))
    console.log(`\n💾 Saved to ${filename}`)
  }

  return article
}
