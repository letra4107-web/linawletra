-- Add ownership/reference columns needed by the web Teacher Schedule feature.
-- Safe and additive: existing scheduled_activities rows are preserved.

alter table public.scheduled_activities
  add column if not exists created_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists teacher_id uuid references public.users(id) on delete set null,
  add column if not exists parent_id uuid references public.users(id) on delete set null,
  add column if not exists student_id uuid references public.students(id) on delete set null;

create index if not exists scheduled_activities_created_by_user_id_idx
  on public.scheduled_activities(created_by_user_id);

create index if not exists scheduled_activities_teacher_id_idx
  on public.scheduled_activities(teacher_id);

create index if not exists scheduled_activities_parent_id_idx
  on public.scheduled_activities(parent_id);

create index if not exists scheduled_activities_student_id_idx
  on public.scheduled_activities(student_id);
