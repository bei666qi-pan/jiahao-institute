create table if not exists jh_social_profiles (
  visitor_id uuid primary key,
  nickname varchar(24) not null default '匿名嘉豪',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jh_rooms (
  room_id uuid primary key,
  code varchar(10) not null unique,
  owner_visitor_id uuid not null,
  name varchar(40) not null,
  room_type varchar(20) not null default 'friends',
  member_limit smallint not null default 20 check (member_limit between 2 and 50),
  allow_pk boolean not null default true,
  status varchar(16) not null default 'active' check (status in ('active', 'closed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jh_room_members (
  member_id uuid primary key,
  room_id uuid not null references jh_rooms(room_id) on delete cascade,
  visitor_id uuid not null,
  nickname varchar(24) not null,
  result_id varchar(48),
  score smallint not null check (score between 0 and 100),
  level varchar(24) not null,
  type varchar(32) not null,
  dimensions jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  source varchar(40) not null default '豪之算法',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, visitor_id)
);

create table if not exists jh_room_pk_matches (
  match_id uuid primary key,
  room_id uuid not null references jh_rooms(room_id) on delete cascade,
  challenger_member_id uuid not null references jh_room_members(member_id) on delete cascade,
  opponent_member_id uuid not null references jh_room_members(member_id) on delete cascade,
  winner_member_id uuid references jh_room_members(member_id) on delete set null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists jh_rooms_owner_idx on jh_rooms(owner_visitor_id, created_at desc);
create index if not exists jh_rooms_code_idx on jh_rooms(code);
create index if not exists jh_room_members_rank_idx on jh_room_members(room_id, verified desc, score desc, joined_at asc);
create index if not exists jh_room_pk_room_idx on jh_room_pk_matches(room_id, created_at desc);
