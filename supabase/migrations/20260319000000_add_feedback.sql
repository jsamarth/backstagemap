create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text,
  thoughts   text not null,
  created_at timestamptz default now()
);

alter table public.feedback enable row level security;

-- Allow anyone (including unauthenticated) to submit feedback
create policy "Anyone can insert feedback"
  on public.feedback for insert
  with check (true);
