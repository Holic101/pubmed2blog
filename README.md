# pubmed2blog

CLI tool that transforms PubMed papers into SEO-optimized healthcare blog articles.

## Installation

```bash
npm install -g pubmed2blog
pubmed2blog init
```

## Quick Start

```bash
# Configure your API keys
pubmed2blog init

# Discover relevant papers
pubmed2blog discover "cardiovascular prevention"

# Get paper details
pubmed2blog extract 39847521

# Generate blog article
pubmed2blog generate 39847521 --type research-explainer

# Full pipeline
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
| `types` | List article types |

## Options

### discover
- `--days <n>` — Days to search back (default: 90)
- `--tier <tiers>` — Journal tiers (default: tier1,tier2)
- `--limit <n>` — Max results (default: 20)
- `--study-type <type>` — individual/meta/any
- `--json` — Output as JSON

### generate
- `--type <type>` — Article type
- `--lang <langs>` — Languages (en,de)
- `--model <model>` — LLM model
- `--save` — Save to file

## Article Types

- **research-explainer**: Study findings for educated lay audience
- **patient-facing**: Accessible, no jargon, short paragraphs
- **differentiation**: "Why we don't offer X"
- **service-connection**: Connect findings to services

## Supported Providers

- Anthropic (Claude)
- OpenAI (GPT)
- Z.AI (GLM)

## Requirements

- Node.js 18+
- API key for at least one LLM provider

## License

MIT
