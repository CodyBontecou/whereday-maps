# Whereday Field Journal

The opt-in journal turns explicitly selected exports into a daily view, reviewed place pages, evidence annotations, trip notes and saved local queries. Legacy `whereday` and `iso-me` maps keep their existing layout unless a new option is enabled.

## Start

Run **Whereday Maps: Insert Field Journal** from Obsidian's command palette. It inserts a block using the configured exports folder (or `exports`). You can also paste:

````markdown
```whereday
source: exports
journal: true
show_receipt: true
auto_refresh: true
tile_provider: none
```
````

The date defaults to the current note's YYYY-MM-DD filename when available, otherwise today. Use the Journal date picker or set `date: YYYY-MM-DD`. The sources need to contain the days you want to browse. A date picker cannot fetch data that has not reached the vault.

Journal appearance uses Whereday's paper/navy light palette and navy/amber dark palette, scoped to this block. Serif/monospaced fonts use locally installed Newsreader/IBM Plex Mono or system fallbacks; no fonts are downloaded. `appearance: native` follows the vault's theme colors. The dial and map markers share place inks. The dial has a chronological button list, so color and clock arcs are never the only way to read a visit.

## Field Notes

The daily view includes overnight stays that overlap the selected day. A completed visit ending exactly at midnight does not appear in the following day. Open visits stop at the export snapshot; if that timestamp is absent, their length is unavailable. Overlapping stays occupy inner rings; crowded lanes share the innermost ring and remain individually available in the list. Blank arcs mean no exported visit evidence, not proof you were absent.

Short stops are hidden from the dial, list and visit-marker layer using **Hide stops shorter than (minutes)**; GPS route samples remain independent. Hidden-stop counts stay visible. The default is one minute. Durations in the journal are clipped to that local day, with `<1 min` and hour/day formatting. Legacy map controls retain arrival-time filtering. In journal mode the journal date picker replaces those legacy controls.

**Create or refresh daily Field Notes** writes a Markdown note under `Whereday/Daily`, including a durable stop list, source snapshot, reflection prompts and a live journal block. **My reflections** sits outside the generated section. Future refreshes replace only the managed section and refuse if it contains local edits. Move edits outside its comment markers or keep a separate note before retrying. Existing prose outside the markers is preserved.

## Place Passports

Open **Place Passports**, search for a stop, then give it a title and optional comma-separated aliases. Choose one stop or explicitly include unassigned stops within 100 metres. Inspect candidate coordinates and evidence before grouping: nearby stops can belong to different venues or floors.

The action creates an ordinary note under `Whereday/Places`, with a stable plugin-assigned identity, native aliases, representative coordinates, loaded visit count, first/last observations and links to daily notes. **Open Places Base** creates (or opens) a native `.base` table filtered to passport notes in this folder, with title, count and first/last observation columns. An existing Base is opened without overwriting its customizations. The file follows [Obsidian’s Bases syntax](https://obsidian.md/help/bases/syntax). Daily-note links may point to notes you have not generated yet.

Existing passport controls support renaming, alias changes, membership changes, reassignment to another passport, and merging assignments. To split a passport, uncheck its selected visits, save membership, then create a new passport from those now-unassigned visits. Notes retain their original paths when renamed, so existing links stay valid. Merges retain the old note and refresh its empty membership rather than deleting user writing. Refresh a daily note after assigning its stops to replace plain labels with passport links.

A passport includes explicitly assigned visit identities only. It does not automatically absorb future nearby visits. Visits use exported IDs when available; legacy records use arrival time plus original coordinates (current coordinates when original evidence is absent). A correction without an exported ID or original coordinates can need reassignment. Equal names never cause an automatic place merge. First/last times and counts describe loaded sources, not lifetime history.

## Evidence Review

Review queues show pending, locally reviewed or all evidence, with ten stops per page. Expand a stop to inspect every retained field: current, original and detected locations, source, confirmation status, confirmation/update timestamps and place-selection evidence when exported. Unknown/absent values are not filled in.

Save a local note to mark the evidence reviewed, or reopen it. This annotation persists locally and does **not** confirm, correct or write back to the phone app. Unconfirmed and short/long stops are review prompts, not automatic error classifications. Never interpret a confirmation label as proof that a computed GPS distance is exact.

## Trip Chapters

Choose a title and inclusive From/Until dates (up to 366 days). Preview groups observations by local date, including days with no visits, clean sample counts and gaps over 30 minutes between samples. Saving a private edition creates a trip note plus a live map scoped to the chosen range.

**Create location-free edition** omits place names, place links, coordinates, visit notes, source paths and the live map. The user-supplied title, dates, times, durations and confirmation labels remain. It is a separate Markdown file for review; nothing is published automatically. Review the title and all surrounding writing before sharing. No travel modes, routes across gaps, country totals, companions or stories are invented.

## Living Export Receipt

The receipt shows snapshot age, latest exported observation, exact source files, duplicate/revision counts and net changes since the last successful load. **Refresh exports** reloads explicitly configured sources. `auto_refresh: true` also observes their vault file changes with debouncing; unrelated note edits do not trigger export reads.

A malformed or partially written replacement leaves the last good map/journal visible with an alert. A later valid replacement can recover. Initial loading errors show an error rather than invented data. A recent export timestamp does not establish that an automated phone-to-vault delivery pipeline works. Phone export scheduling and vault delivery must be configured separately; this plugin observes files already in the vault.

Identical normalized records are deduplicated, including duplicates within one file. Identical snapshot contents under different names are flagged. Visits with exported IDs and distinct valid `updatedAt` values choose the latest revision; conflicting equal/missing revisions stay visible and are counted. Legacy visits without IDs are merged only when all normalized fields match. Outing IDs choose the latest effective endpoint. Receipts explain those boundaries. GPS lines break at midnight, non-increasing timestamps and gaps over 30 minutes; no lines bridge missing coverage.

## Recall Queries

Open **Recall Queries**, enter text and optionally choose app confirmation, minimum duration, From/Until dates and reviewed-place revisits. Text matches exported names, addresses, notes, reviewed titles and aliases. A revisit means at least two visits in loaded sources explicitly assigned to one passport. Results are paginated and focus the underlying visit on the map.

**Save reproducible query** writes a note under `Whereday/Queries`, with the query, its exact resolved source paths and a result snapshot. Opening it runs the query again against those sources and the current local passport assignments; later data or edits can change results. The original snapshot updates only when explicitly saved again. No cloud service or language model is used.

## New block options

| Option | Default | Meaning |
| --- | --- | --- |
| `journal` | false | Complete daily journal and expandable tools. |
| `appearance` | Whereday for journal; native for legacy | `whereday` or `native`. |
| `show_receipt` | true in journal | Export receipt and manual refresh. |
| `show_passports` | true in journal | Reviewed place-note tools. |
| `show_review` | true in journal | Local evidence review. |
| `show_chapters` | true in journal | Trip note tools. |
| `show_recall` | true in journal | Local query tools; explicit true opens the query section. |
| `min_stop_minutes` | 1 | Hide shorter journal stays; 0–1440. |
| `journal_folder` | `Whereday/Daily` | Destination for generated daily notes. |
| `places_folder` | `Whereday/Places` for passports | Passport destination; existing legacy place-link default is unchanged. |
| `trip_folder` | `Whereday/Trips` | Trip destination. |
| `query` | empty | Recall text, quoted when necessary. |
| `recall_status` | any | any / confirmed / corrected / unconfirmed. |
| `recall_min_minutes` | 0 | Recall minimum duration. |
| `recall_revisit` | false | Reviewed passport revisits only. |
| `from`, `until` | unbounded | Inclusive local date range for source data and recall. |

Generated folders must be visible vault-relative paths without traversal. Exports continue to use the existing source scoping and file-format rules.

## Local storage and backup

Journal assignments, local reviews and exact managed-section baselines are stored in `.obsidian/plugins/iso-me-maps/journal-state.json` (under the vault's configured Obsidian config directory). Before a save, the previous state is copied to `journal-state.json.bak`. Back up these alongside your generated notes. Managed baselines contain generated note content and can therefore include private location data. The plugin adds no encryption. Obsidian Sync or other synchronization software can copy these files according to its settings.

An invalid state file blocks journal actions with an error instead of replacing it with empty state. Restore a known-good backup while Obsidian is closed, then reopen the vault. Passport/review state is shared across journal blocks in this vault; reopen or refresh another already-open block to update its view.

No general bidirectional phone edits, portable photo export, stable native visit IDs for legacy exports, country/timezone enrichment, billing mileage certification or cloud question answering is included. This journal uses actual exported evidence and explicit local writing actions.
