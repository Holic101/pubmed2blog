# pubmed2blog

CLI tool that transforms PubMed papers into SEO-optimized healthcare blog articles.

## Why pubmed2blog?

Healthcare marketers need to produce evidence-based content, but:
- Manually searching PubMed takes hours
- Evaluating study quality requires medical literacy
- Writing accessible articles from dense papers is time-consuming

pubmed2blog automates the entire pipeline — from research discovery to publishable blog posts.

## Features

- **PubMed Search** — Search with MeSH terms, journal filters, and date ranges
- **AI-Powered Scoring** — Ranks papers by blog suitability (journal tier, study type, sample size, novelty)
- **Multi-Source Full Text** — Fetches full text from PMC, Unpaywall, Europe PMC, and OpenAlex
- **Brand Voice** — Inject your own brand voice into generated articles
- **4 Article Types** — Research Explainer, Patient-Facing, Differentiation, Service Connection
- **Multi-Language** — Generate in English, German, or both
- **Open Source** — MIT licensed, npm packageable

## Installation

```bash
npm install -g pubmed2blog
pubmed2blog init
```

## Quick Start

```bash
# Configure your API keys (interactive)
pubmed2blog init

# Discover relevant papers (ranked by blog suitability)
pubmed2blog discover "cardiovascular prevention"

# Get paper details
pubmed2blog extract 39847521

# Generate blog article
pubmed2blog generate 39847521 --type research-explainer

# Full pipeline (discover + extract + generate)
pubmed2blog pipeline "sleep quality" --top 3 --save
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Interactive setup (API keys, brand voice) |
| `discover <keyword>` | Search and rank papers by blog suitability |
| `extract <pmid>` | Fetch full paper details |
| `generate <pmid>` | Generate blog article |
| `pipeline <keyword>` | Full pipeline: discover → extract → generate |
| `config` | Show current configuration |
| `keywords` | List configured keyword categories |
| `types` | List article types with descriptions |

## Options

### discover
```bash
pubmed2blog discover "keyword" [options]
```
- `--days <n>` — Days to search back (default: 90)
- `--tier <tiers>` — Journal tiers: tier1,tier2,tier3 (default: tier1,tier2)
- `--limit <n>` — Max results (default: 20)
- `--study-type <type>` — Filter: individual, meta, any (default: any)
- `--json` — Output as JSON

### extract
```bash
pubmed2blog extract <pmid> [options]
```
- `--json` — Output as JSON
- `--save` — Save to file

### generate
```bash
pubmed2blog generate <pmid> [options]
```
- `--type <type>` — Article type (default: research-explainer)
- `--lang <langs>` — Languages: en,de (comma-separated)
- `--model <model>` — LLM model override
- `--save` — Save article to ./output/

### pipeline
```bash
pubmed2blog pipeline <keyword> [options]
```
- `--top <n>` — Number of papers to process (default: 1)
- `--type <type>` — Article type
- `--save` — Save all outputs

## Article Types

### research-explainer
Study findings for an educated lay audience. Lead with surprising finding, include numbers with explanations, mandatory limitations section, actionable takeaways.

### patient-facing
Accessible explanation without jargon. Short paragraphs, analogies, clear "Bottom Line" with 3 bullets.

### differentiation
"Why we don't offer X" — Acknowledge hype fairly, present pro + contra arguments, explain evidence standards.

### service-connection
80% science, 20% relevance. Connect study findings to preventive health services.

## Supported Providers

| Provider | Environment Variable | Default Model |
|----------|---------------------|--------------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Z.AI | `ZAI_API_KEY` | glm-4-flash |

Model auto-detection: `claude*` → Anthropic, `gpt*/o1*/o3*` → OpenAI, `glm*` → Z.AI

## Configuration

Config is stored in `~/.pubmed2blog/config.json`:
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-20250514",
  "languages": ["de", "en"],
  "brandVoice": "Your brand voice description...",
  "journalTiers": ["tier1", "tier2"],
  "defaultArticleType": "research-explainer",
  "outputDir": "./output"
}
```

## Scoring Algorithm

Papers are scored by blog suitability:
- **Journal Tier** — Tier 1 (IF>50): +30, Tier 2 (IF 15-50): +20, Tier 3 (IF 5-15): +10
- **Study Type** — RCT: +25, Clinical Trial: +20, Cohort: +15, Meta-Analysis: +5
- **Sample Size** — ≥10,000: +20, ≥1,000: +15, ≥100: +10
- **Novelty** — +5 for signals like "first", "novel", "breakthrough"
- **Actionability** — +5 for signals like "recommendation", "guideline"

## Full Text Sources

Tried in order:
1. **PMC** — PubMed Central (free, official)
2. **Unpaywall** — Legal OA versions
3. **Europe PMC** — European mirror
4. **OpenAlex** — Research graph API

If no full text available, article is generated from abstract only.

## Requirements

- Node.js 18+
- API key for at least one LLM provider

## Use Cases

- Healthcare clinics publishing evidence-based blog posts
- Healthtech companies creating content from research
- Medical marketers automating content production
- Preventive medicine practices sharing latest findings

## Roadmap

- [ ] Tests
- [ ] CI/CD
- [ ] More article types
- [ ] Custom prompt templates

## License

MIT

## Links

- npm: https://www.npmjs.com/package/pubmed2blog
- GitHub: https://github.com/Holic101/pubmed2blog
