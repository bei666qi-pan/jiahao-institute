create table if not exists jh_scene_shares (
  code varchar(16) primary key,
  scene_id varchar(32) not null,
  owner_id uuid not null,
  moment jsonb,
  ending text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists jh_scene_shares_expiry on jh_scene_shares(expires_at) where moment is not null;
