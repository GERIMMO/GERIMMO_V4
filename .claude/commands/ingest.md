---
description: Ingest a source from raw/ into the wiki
argument-hint: <path-to-source-in-raw>
---

Run the INGEST workflow from CLAUDE.md on: $ARGUMENTS

Steps:
1. Read the source at $ARGUMENTS (fetch if URL).
2. Discuss 2-5 key takeaways with the user.
3. Create `wiki/sources/YYYY-MM-DD-slug.md` with summary, key claims, entities, concepts, quotes.
4. Create/update entity and concept pages for each mentioned; flag contradictions with `> [!warning]`.
5. Update `index.md`.
6. Append an entry to `log.md`.
7. Report created/updated pages, contradictions, and open questions.