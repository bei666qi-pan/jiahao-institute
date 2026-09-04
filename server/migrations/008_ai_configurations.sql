create table if not exists jh_ai_configurations (
  slot varchar(16) primary key check (slot in ('text','vision','image','video')),
  provider varchar(40) not null,
  base_url varchar(500) not null,
  model varchar(120) not null,
  encrypted_api_key jsonb not null,
  options jsonb not null default '{}'::jsonb,
  tested_at timestamptz not null,
  activated_at timestamptz not null,
  updated_at timestamptz not null default now()
);
