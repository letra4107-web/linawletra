-- LinawLetra assessments table.
-- Run this in Supabase SQL Editor if the Admin/Teacher assessment screens need
-- assessment history. It is intentionally additive and does not delete data.

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade,
  parent_id uuid references public.users(id) on delete set null,
  categories jsonb not null default '{}'::jsonb,
  overall_score integer,
  difficulty_adaptation text,
  recommended_start_level integer,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assessments_student_id on public.assessments(student_id);
create index if not exists idx_assessments_parent_id on public.assessments(parent_id);
create index if not exists idx_assessments_completed_at on public.assessments(completed_at desc);

alter table public.assessments enable row level security;
