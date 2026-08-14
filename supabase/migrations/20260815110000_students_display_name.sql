ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE public.students s
SET display_name = COALESCE(NULLIF(u.name, ''), NULLIF(u.metadata->>'displayName', ''), u.email)
FROM public.users u
WHERE s.user_id = u.id
  AND NULLIF(s.display_name, '') IS NULL
  AND COALESCE(NULLIF(u.name, ''), NULLIF(u.metadata->>'displayName', ''), u.email) IS NOT NULL;

NOTIFY pgrst, 'reload schema';
