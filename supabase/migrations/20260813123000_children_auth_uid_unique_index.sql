-- Prevent duplicate children rows per auth user going forward.
-- This was applied ad hoc via server/scripts/cleanup_and_recreate_children.mjs
-- during the students/children unification cleanup; recorded here as a
-- proper migration so fresh environments get the same guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS children_auth_uid_unique_idx
  ON public.children (auth_uid)
  WHERE auth_uid IS NOT NULL;
