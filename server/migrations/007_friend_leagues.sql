alter table jh_social_profiles add column if not exists recovery_digest varchar(64);
alter table jh_social_profiles add column if not exists recovery_issued_at timestamptz;
alter table jh_social_profiles add column if not exists last_active_at timestamptz not null default now();

create unique index if not exists jh_social_profiles_recovery_idx
  on jh_social_profiles(recovery_digest) where recovery_digest is not null;

create table if not exists jh_league_members (
  member_id uuid primary key,
  room_id uuid not null references jh_rooms(room_id) on delete cascade,
  visitor_id uuid not null,
  nickname varchar(24) not null,
  joined_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  unique (room_id, visitor_id)
);

create table if not exists jh_league_seasons (
  season_id uuid primary key,
  room_id uuid not null references jh_rooms(room_id) on delete cascade,
  season_number integer not null check (season_number > 0),
  start_date date not null,
  end_date date not null,
  status varchar(16) not null default 'active' check (status in ('active', 'finished')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (room_id, season_number),
  check (end_date = start_date + 6)
);

create table if not exists jh_league_rounds (
  round_id uuid primary key,
  season_id uuid not null references jh_league_seasons(season_id) on delete cascade,
  round_date date not null,
  prompt_id varchar(48) not null,
  character varchar(16) not null check (character in ('jiahao', 'nailoong')),
  prompt_text varchar(240) not null,
  status varchar(16) not null default 'open' check (status in ('open', 'finished')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (season_id, round_date)
);

create table if not exists jh_league_submissions (
  submission_id uuid primary key,
  round_id uuid not null references jh_league_rounds(round_id) on delete cascade,
  member_id uuid not null references jh_league_members(member_id) on delete cascade,
  answer_text varchar(120),
  answer_deleted_at timestamptz,
  idempotency_key uuid not null,
  judge_status varchar(16) not null default 'ready' check (judge_status in ('pending', 'ready', 'failed')),
  ai_score smallint check (ai_score between 0 and 100),
  tag varchar(16),
  verdict varchar(60),
  hidden boolean not null default false,
  share_answer boolean not null default false,
  finalized_points smallint,
  popularity_bonus smallint not null default 0,
  created_at timestamptz not null default now(),
  judged_at timestamptz,
  unique (round_id, member_id),
  unique (member_id, idempotency_key)
);

create table if not exists jh_league_votes (
  round_id uuid not null references jh_league_rounds(round_id) on delete cascade,
  voter_member_id uuid not null references jh_league_members(member_id) on delete cascade,
  submission_id uuid not null references jh_league_submissions(submission_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, voter_member_id)
);

create table if not exists jh_league_reports (
  report_id uuid primary key,
  submission_id uuid not null references jh_league_submissions(submission_id) on delete cascade,
  reporter_member_id uuid not null references jh_league_members(member_id) on delete cascade,
  reason varchar(40) not null,
  created_at timestamptz not null default now(),
  unique (submission_id, reporter_member_id)
);

create table if not exists jh_league_unlocks (
  visitor_id uuid not null,
  unlock_key varchar(48) not null,
  source varchar(24) not null default 'league',
  unlocked_at timestamptz not null default now(),
  primary key (visitor_id, unlock_key)
);

create table if not exists jh_league_prompt_overrides (
  prompt_date date primary key,
  prompt_id varchar(48) not null,
  character varchar(16) not null check (character in ('jiahao', 'nailoong')),
  prompt_text varchar(240) not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists jh_league_members_visitor_idx on jh_league_members(visitor_id, last_active_at desc);
create index if not exists jh_league_seasons_room_idx on jh_league_seasons(room_id, season_number desc);
create index if not exists jh_league_rounds_date_idx on jh_league_rounds(round_date desc);
create index if not exists jh_league_submissions_round_idx on jh_league_submissions(round_id, created_at);
create index if not exists jh_league_votes_submission_idx on jh_league_votes(submission_id);
create index if not exists jh_league_reports_created_idx on jh_league_reports(created_at desc);
