# pubmed2blog — Handover an Neo

## Was ist das?

Open-Source CLI Tool das PubMed Papers in SEO-optimierte Healthcare Blog-Artikel verwandelt. Node.js, MIT Lizenz, npm-publishbar.

**Repo:** Dima erstellt das GitHub Repo — du bekommst die URL.

---

## Deine Referenzen

### PRD (deine Spec)
`/Users/dima/Library/Mobile Documents/iCloud~md~obsidian/Documents/SecondBrain/Projects/pubmed2blog/PRD.md`

Lies das komplett. Das ist dein Blueprint. Alles steht drin: User Stories, File Structure, Scoring Algorithmus, Onboarding Flow, Article Types, Provider Endpoints.

### Original-Codebase (YEARS intern — deine Vorlage)
`/Users/dima/years-clawd/tools/pubmed2blog/`

```
years-clawd/tools/pubmed2blog/
├── cli.js                    # Commander-basierte CLI (port + refactor)
├── src/
│   ├── generator.js          # LLM Article Generation (Anthropic + Z.AI)
│   ├── pubmed.js             # PubMed E-Utilities Search + Scoring
│   └── gsc.js                # ❌ Google Search Console (NICHT portieren)
├── config/
│   ├── journals.json         # Journal Tier Definitionen (portieren!)
│   └── mesh-filters.json     # MeSH Filter + Keywords (portieren!)
├── templates/                # Prompt Templates
├── lib/                      # Helper Utilities
└── package.json              # Dependencies Referenz
```

**Was portieren:** `pubmed.js`, `generator.js`, `cli.js`, `journals.json`, `mesh-filters.json`, Templates
**Was NICHT portieren:** `gsc.js`, Sci-Hub Code (falls vorhanden), YEARS-spezifische Prompts

---

## Build Plan (7 Phasen)

| Phase | Was | Quellen |
|-------|-----|---------|
| 1 | Scaffold: `package.json`, `bin/pubmed2blog.js`, File Structure laut PRD §3.2 | PRD |
| 2 | Port `pubmed.js` → `src/pubmed.js` + `src/fulltext.js` (trennen!) | Original `src/pubmed.js` |
| 3 | `src/config.js` + `src/init.js` (Onboarding Flow) | PRD §4 |
| 4 | `src/generator.js` + `src/providers/` (Anthropic, OpenAI, Z.AI) | Original `src/generator.js` |
| 5 | CLI Wiring: alle Commands in `bin/pubmed2blog.js` verdrahten | Original `cli.js` + PRD §2 |
| 6 | `config/article-types.json`, `templates/brand-voice-example.md`, `README.md`, `LICENSE` | PRD §3.7 |
| 7 | OpenClaw `skill/SKILL.md` Wrapper + Final Review | PRD §6 |

---

## Architektur-Entscheidungen (bereits getroffen)

1. **ESM** (`"type": "module"` in package.json)
2. **Node 18+** (native `fetch()`, kein axios/node-fetch)
3. **3 Dependencies only:** `commander`, `fast-xml-parser`, `enquirer`
4. **Config:** `~/.pubmed2blog/config.json`
5. **Provider Auto-Detection:** `claude*` → Anthropic, `gpt*/o1*/o3*` → OpenAI, `glm*` → Z.AI
6. **Kein Sci-Hub** — legal risk für OSS
7. **Kein GSC/CMS** in v1
8. **Brand Voice via Onboarding** — nicht hardcoded
9. **4 Article Types:** research-explainer, patient-facing, differentiation, service-connection
10. **MIT Lizenz**

---

## Kritische Details

### PubMed API
- E-Utilities: `eutils.ncbi.nlm.nih.gov/entrez/eutils/`
- `esearch.fcgi` für Suche, `efetch.fcgi` für Paper Details
- Rate Limit: 350ms zwischen Requests (3 req/sec ohne API Key)
- Response: XML → `fast-xml-parser`

### Full Text Chain (Reihenfolge!)
1. PMC Open Access (`eutils.ncbi.nlm.nih.gov`)
2. Unpaywall (`api.unpaywall.org/v2/{doi}?email=...`)
3. Europe PMC (`europepmc.org/rest/search?query=...`)
4. OpenAlex (`api.openalex.org/works/doi:{doi}`)

### Scoring (PRD §3.6)
Composite Score aus Journal Tier + Study Type + Sample Size + Novelty + Actionability. Max ~100 Punkte. Details im PRD.

### Prompts
Original-Prompts sind YEARS-spezifisch (HWG-konform, Klinik-Referenzen). Du musst sie **generisch** machen — Brand Voice kommt vom User via Config, nicht hardcoded.

---

## Output-Ziel

Working `pubmed2blog` CLI:
```bash
npx pubmed2blog init                              # Onboarding
npx pubmed2blog discover "cardiovascular prevention"  # Suche + Ranking
npx pubmed2blog extract 39847521                   # Paper Details
npx pubmed2blog generate 39847521 --type research-explainer --save
npx pubmed2blog pipeline "sleep quality" --top 3 --save  # Full Pipeline
```

Kein User sollte mehr als 5 Minuten von `npm install` bis zum ersten generierten Artikel brauchen.

---

## Qualitäts-Checks

- [ ] Alle 6 Commands funktionieren (init, discover, extract, generate, pipeline, config)
- [ ] API Key Validierung im Init Flow
- [ ] Alle 3 Provider (Anthropic, OpenAI, Z.AI) funktionieren
- [ ] Full Text Fallback Chain funktioniert
- [ ] `--json` Output ist valides JSON
- [ ] `--save` schreibt Markdown mit YAML Frontmatter
- [ ] Scoring sortiert korrekt
- [ ] Rate Limiting eingehalten
- [ ] README mit Quick Start, Examples, API Reference
- [ ] `npx pubmed2blog` funktioniert (bin field in package.json)

---

## Was du NICHT machen sollst

- Keine Tests schreiben (v1 — kommt später)
- Keinen CI/CD aufsetzen
- Keine GUI/Web UI
- Keinen CMS-Push
- Nichts am YEARS-Original ändern
- Nicht am Benji/Main Workspace arbeiten

---

## Fragen?

Frag Benji (main agent) — der hat den gesamten Kontext.
