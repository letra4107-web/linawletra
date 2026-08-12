-- ============================================================================
-- LINAWLETRA INTERMEDIATE AND ADVANCED SEQUENTIAL MODULES
-- ============================================================================
-- Additive module seed using existing curriculum_items only.
-- Beginner modules are intentionally untouched.
-- ============================================================================

WITH intermediate_modules AS (
  SELECT
    CASE
      WHEN module_number <= 10 THEN 'intermediate-module-' || lpad(module_number::TEXT, 2, '0') || '-words'
      ELSE 'intermediate-module-' || lpad(module_number::TEXT, 2, '0') || '-phrases'
    END AS id,
    'intermediate'::TEXT AS reading_level,
    module_number,
    CASE
      WHEN module_number <= 10 THEN format('Mga Salita %s', module_number)
      ELSE format('Mga Parirala %s', module_number - 10)
    END AS title,
    CASE
      WHEN module_number <= 10 THEN format('Intermediate word practice set %s using existing official curriculum words.', module_number)
      ELSE format('Intermediate phrase practice set %s using existing official curriculum phrases.', module_number - 10)
    END AS description,
    module_number AS sequence_no,
    CASE WHEN module_number <= 10 THEN 'word' ELSE 'phrase' END AS content_type,
    'intermediate-module-' || lpad(module_number::TEXT, 2, '0') || '-assessment' AS assessment_id,
    jsonb_build_object('accent', (ARRAY['violet','green','sun','blue','coral'])[((module_number - 1) % 5) + 1]) AS metadata
  FROM generate_series(1, 20) AS module_number
),
advanced_modules AS (
  SELECT
    CASE
      WHEN module_number <= 10 THEN 'advanced-module-' || lpad(module_number::TEXT, 2, '0') || '-words'
      WHEN module_number <= 20 THEN 'advanced-module-' || lpad(module_number::TEXT, 2, '0') || '-sentences'
      ELSE 'advanced-module-21-paragraph-assessment'
    END AS id,
    'advanced'::TEXT AS reading_level,
    module_number,
    CASE
      WHEN module_number <= 10 THEN format('Mas Mahabang Salita %s', module_number)
      WHEN module_number <= 20 THEN format('Mga Pangungusap %s', module_number - 10)
      ELSE 'Reading Passage Assessment'
    END AS title,
    CASE
      WHEN module_number <= 10 THEN format('Advanced word practice set %s using existing official curriculum words.', module_number)
      WHEN module_number <= 20 THEN format('Advanced sentence practice set %s using existing official curriculum sentences.', module_number - 10)
      ELSE 'Advanced paragraph reading assessments using existing official curriculum passages.'
    END AS description,
    module_number AS sequence_no,
    CASE
      WHEN module_number <= 10 THEN 'word'
      WHEN module_number <= 20 THEN 'sentence'
      ELSE 'paragraph'
    END AS content_type,
    'advanced-module-' || lpad(module_number::TEXT, 2, '0') || '-assessment' AS assessment_id,
    jsonb_build_object('accent', (ARRAY['violet','green','sun','blue','coral'])[((module_number - 1) % 5) + 1]) AS metadata
  FROM generate_series(1, 21) AS module_number
),
module_seed AS (
  SELECT * FROM intermediate_modules
  UNION ALL
  SELECT * FROM advanced_modules
)
INSERT INTO public.curriculum_modules
  (id, reading_level, module_number, title, description, sequence_no, content_type, required, assessment_id, metadata)
SELECT
  id,
  reading_level,
  module_number,
  title,
  description,
  sequence_no,
  content_type,
  TRUE,
  assessment_id,
  metadata
FROM module_seed
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  sequence_no = EXCLUDED.sequence_no,
  content_type = EXCLUDED.content_type,
  required = EXCLUDED.required,
  assessment_id = EXCLUDED.assessment_id,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

WITH module_ranges AS (
  SELECT
    'intermediate-module-' || lpad(module_number::TEXT, 2, '0') || '-words' AS module_id,
    'intermediate'::TEXT AS reading_level,
    'word'::TEXT AS content_type,
    201 + ((module_number - 1) * 20) AS start_sequence,
    220 + ((module_number - 1) * 20) AS end_sequence,
    'real_word'::TEXT AS module_item_kind
  FROM generate_series(1, 10) AS module_number
  UNION ALL
  SELECT
    'intermediate-module-' || lpad((module_number + 10)::TEXT, 2, '0') || '-phrases' AS module_id,
    'intermediate',
    'phrase',
    801 + ((module_number - 1) * 20),
    820 + ((module_number - 1) * 20),
    'assessment_item'
  FROM generate_series(1, 10) AS module_number
  UNION ALL
  SELECT
    'advanced-module-' || lpad(module_number::TEXT, 2, '0') || '-words' AS module_id,
    'advanced',
    'word',
    401 + ((module_number - 1) * 20),
    420 + ((module_number - 1) * 20),
    'real_word'
  FROM generate_series(1, 10) AS module_number
  UNION ALL
  SELECT
    'advanced-module-' || lpad((module_number + 10)::TEXT, 2, '0') || '-sentences' AS module_id,
    'advanced',
    'sentence',
    1001 + ((module_number - 1) * 20),
    1020 + ((module_number - 1) * 20),
    'assessment_item'
  FROM generate_series(1, 10) AS module_number
  UNION ALL
  SELECT
    'advanced-module-21-paragraph-assessment' AS module_id,
    'advanced',
    'paragraph',
    1201,
    1220,
    'assessment_item'
),
resolved_items AS (
  SELECT
    ranges.module_id,
    items.id AS curriculum_item_id,
    items.sequence_no - ranges.start_sequence + 1 AS sequence_no,
    ranges.content_type,
    1 + floor((items.sequence_no - ranges.start_sequence) / 5)::INTEGER AS practice_set_number,
    ranges.module_item_kind
  FROM module_ranges ranges
  JOIN public.curriculum_items items
    ON items.reading_level = ranges.reading_level
   AND items.item_type = ranges.content_type
   AND items.sequence_no BETWEEN ranges.start_sequence AND ranges.end_sequence
   AND items.is_active = TRUE
)
INSERT INTO public.curriculum_module_items
  (module_id, curriculum_item_id, sequence_no, content_type, practice_set_number, module_item_kind)
SELECT
  module_id,
  curriculum_item_id,
  sequence_no,
  content_type,
  practice_set_number,
  module_item_kind
FROM resolved_items
ON CONFLICT (module_id, curriculum_item_id) DO UPDATE SET
  sequence_no = EXCLUDED.sequence_no,
  content_type = EXCLUDED.content_type,
  practice_set_number = EXCLUDED.practice_set_number,
  module_item_kind = EXCLUDED.module_item_kind,
  updated_at = NOW();
