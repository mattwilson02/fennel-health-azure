create table users (
  id serial primary key,
  email text unique not null,
  password_hash text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table readings (
  id bigserial primary key,
  user_id int not null references users(id),
  kind text not null check (kind in ('sleep', 'food', 'glucose')),
  value numeric not null,
  unit text not null,
  source text not null,
  recorded_at timestamptz not null
);
create index readings_user_time on readings (user_id, recorded_at desc);

create table webhook_events (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  raw jsonb not null
);
