-- Licensing for desktop (Electron) distribution. Run in SQL Editor.
create table if not exists plans (
  id text primary key,
  name text not null,
  limits jsonb not null default '{"maxAccounts": 3, "dailyMessages": 1000}',
  created_at timestamptz default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  created_at timestamptz default now()
);

create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  customer_id uuid references customers(id) on delete set null,
  plan_id text references plans(id) on delete set null,
  status text not null default 'active' check (status in ('active','suspended','expired')),
  expires_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

alter table plans enable row level security;
alter table customers enable row level security;
alter table licenses enable row level security;
-- no public table access; anon talks only through functions below

insert into plans (id, name, limits) values
  ('basic', 'أساسية', '{"maxAccounts": 3, "dailyMessages": 1000}'),
  ('pro', 'احترافية', '{"maxAccounts": 10, "dailyMessages": 5000}'),
  ('unlimited', 'غير محدودة', '{"maxAccounts": 30, "dailyMessages": 20000}')
on conflict (id) do nothing;

-- validate: returns license + plan limits, or nothing. Safe for anon.
create or replace function validate_license(p_key text)
returns table (status text, expires_at timestamptz, max_accounts int, daily_messages int, plan_name text)
language sql security definer set search_path = public as $$
  select l.status, l.expires_at,
    coalesce((p.limits->>'maxAccounts')::int, 3),
    coalesce((p.limits->>'dailyMessages')::int, 1000),
    p.name
  from licenses l left join plans p on p.id = l.plan_id
  where l.key = p_key;
$$;

-- heartbeat: updates last_seen, returns same payload
create or replace function license_heartbeat(p_key text)
returns table (status text, expires_at timestamptz, max_accounts int, daily_messages int, plan_name text)
language sql security definer set search_path = public as $$
  update licenses set last_seen_at = now() where key = p_key;
  select l.status, l.expires_at,
    coalesce((p.limits->>'maxAccounts')::int, 3),
    coalesce((p.limits->>'dailyMessages')::int, 1000),
    p.name
  from licenses l left join plans p on p.id = l.plan_id
  where l.key = p_key;
$$;

-- owner creates a license: insert into customers, then:
-- insert into licenses (key, customer_id, plan_id, expires_at)
-- values ('WMP-' || upper(substr(md5(random()::text),1,4)) || '-' || upper(substr(md5(random()::text),1,4)), '<customer-uuid>', 'pro', now() + interval '1 year');
