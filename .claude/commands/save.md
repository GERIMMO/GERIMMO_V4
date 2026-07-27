---
description: File the last response as a synthesis page
argument-hint: [optional-slug]
---

File the previous assistant response into `wiki/syntheses/<slug>.md`.

Slug: $ARGUMENTS (if empty, derive a concise kebab-case slug from the content).

Steps:
1. Write the synthesis page with proper frontmatter (`type: synthesis`, `created`, `updated`, `tags`, `sources`).
2. Preserve `[[wikilinks]]` and add a `## References` section.
3. Update `index.md` to list the new synthesis.
4. Append an entry to `log.md`.