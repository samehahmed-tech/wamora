-- Run once in Supabase Dashboard > SQL Editor
create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table kv_store enable row level security;

-- backend uses SERVICE_ROLE (bypasses RLS), no public access
-- optional read-only for anon if frontend needs direct access later:
-- create policy "deny anon" on kv_store for all using (false);
