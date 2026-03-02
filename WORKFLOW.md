# pubmed2blog Pipeline Workflow

## Übersicht

Automatisierte Content-Pipeline: PubMed → Draft → Review → Approval → Publish

```
[Cron: Weekly Discover] → [Writer: Generate Drafts] → [Reviewer: QA Check]
                                                            ↓ pass        ↓ fail
                                                     [Discord: Draft     [Rewrite mit
                                                      an Jan]             Feedback]
                                                            ↓
                                                     [Jan: Approve/Reject]
```

## Pipeline Steps

### Step 1: Discoverer (Cron, wöchentlich)
- `pubmed2blog discover <keyword> --limit 10 --days 7 --json`
- Keywords: konfiguriert in `config/mesh-filters.json`
- Filtert nach Score > 30
- Output: `pipeline/queue.json` mit PMIDs

### Step 2: Writer (automatisch nach Discover)
- Für jeden PMID: `pubmed2blog generate <pmid> --type research-explainer --lang de --save`
- Output: `output/<pmid>-de.md`

### Step 3: Reviewer Agent (automatisch nach Writer)
- Liest jeden Draft
- Prüft:
  - **AI-Sprech:** Em-Dashes (—), "Es ist wichtig zu beachten", "In der heutigen Zeit", "Zusammenfassend lässt sich sagen", "zweifellos", "ohne Zweifel", "revolutionär", "bahnbrechend"
  - **Fakten:** Zahlen (HR, CI, p-Werte, Stichprobe) müssen mit PubMed-Abstract übereinstimmen
  - **Medical Claims:** Nur Assoziationssprache, keine Heilversprechen
  - **Brand Voice:** Ruhig, präzise, evidenzbasiert (YEARS-Ton)
- Pass → `output/approved/`
- Fail → `output/revision/` mit Feedback-Datei

### Step 4: Publisher (nach Review-Pass)
- Sendet approved Draft als Zusammenfassung nach Discord #years
- Format: Titel, Hook, PMID-Link, "Bitte prüfen"
- Jan gibt Feedback direkt im Channel

## Setup

### Config
```bash
# ~/.pubmed2blog/config.json wird beim init erstellt
pubmed2blog init
```

### Keywords (Jahre-relevant)
Empfohlene Discover-Keywords:
- `longevity biomarkers`
- `whole body MRI screening`
- `VO2max cardiovascular`
- `epigenetic clock aging`
- `preventive health diagnostics`
- `liquid biopsy cancer screening`

## Cron-Integration

Der Workflow läuft als OpenClaw Cron Job:
- **Trigger:** Wöchentlich (Montag 06:00)
- **Session:** isolated agentTurn
- **Task:** "Führe die pubmed2blog Pipeline aus: discover mit Keywords, generate Drafts, review, und sende approved Artikel nach #years"

## Manueller Lauf

```bash
cd /Users/dima/.openclaw/workspace/years/pubmed2blog

# Discover
node bin/pubmed2blog.js discover "VO2max mortality" --limit 5 --days 30

# Generate
node bin/pubmed2blog.js generate <pmid> --type research-explainer --lang de --save

# Full Pipeline
node bin/pubmed2blog.js pipeline "longevity biomarkers" --top 3 --save
```
