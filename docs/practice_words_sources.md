# Practice Words — Verification Notes

Source-checking log for the initial `practice_words` seed data
(`supabase_migration_practice_words.sql`). Kept separate from the SQL file so
future additions can be logged here without touching the migration.

## Homograph pairs included

- **bába** (chin) vs **babâ** (low / going down, e.g. of price) — two
  distinct dictionary senses confirmed independently for the plain spelling
  "baba": anatomical (chin) and lowness/descending. Stress/glottal pattern
  follows standard KWF tuldik convention (pahilís on the penultimate for
  "chin," pakupyâ — final-syllable stress + glottal stop — for "low").
- **magbabasá** (will read) vs **magbabasâ** (will get wet) — supplied by
  the user as their own worked example in the original task prompt; not
  independently re-verified here since it was given as an accepted case,
  not discovered during this audit.

## Considered and excluded

- **buhay/buháy** ("life" vs "alive") — a commonly cited example in
  secondary sources (blogs, language-learning sites), but those sources
  disagreed with each other on which sense takes which mark, and direct
  lookup of the KWF Diksiyonaryo site failed (server error) during this
  session. Left out of the seed data rather than ship an unconfirmed pair —
  a wrong stress mark actively mis-teaches. Worth adding once someone can
  confirm directly against KWF Diksiyonaryong Filipino or UP Diksiyonaryo.

## Non-homograph words

The 15 unambiguous words (aso, pusa, bahay, tubig, mesa, mata, kamay,
masaya, mabait, malaki, maliit, mabilis, tahimik, mahalaga, kumusta) are
common, everyday grade 1-6 vocabulary with no competing dictionary sense —
assessed directly rather than individually source-checked, consistent with
how the Task 2 audit treated the app's existing unambiguous words.

## Before adding more words

1. Check the candidate word against KWF Diksiyonaryong Filipino
   (kwfdiksiyonaryo.ph) or UP Diksiyonaryo directly — not memory, not a
   secondary blog, which this session found to disagree with each other on
   at least one pair.
2. Only mark `is_homograph = true` when two genuinely distinct dictionary
   senses exist for the same plain spelling.
3. Log the source checked here, including for words that turn out *not* to
   be homographs — a documented "checked, not ambiguous" is as useful as a
   documented pair.
