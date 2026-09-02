alter table jh_room_members add column if not exists schema_version smallint not null default 1;
alter table jh_room_members add column if not exists nailoong_score smallint check (nailoong_score between 0 and 100);
alter table jh_room_members add column if not exists nailoong_level varchar(24);
alter table jh_room_members add column if not exists nailoong_archetype varchar(32);
alter table jh_room_members add column if not exists nailoong_dimensions jsonb not null default '{}'::jsonb;
alter table jh_room_members add column if not exists composite_score smallint;
alter table jh_room_members add column if not exists season_points integer not null default 0;

update jh_room_members set composite_score = score where composite_score is null;
alter table jh_room_members alter column composite_score set not null;

create table if not exists jh_room_task_attempts (
  attempt_id uuid primary key,
  room_id uuid not null references jh_rooms(room_id) on delete cascade,
  member_id uuid not null references jh_room_members(member_id) on delete cascade,
  visitor_id uuid not null,
  task_date date not null,
  task_id varchar(48) not null,
  points smallint not null default 3 check (points between 0 and 10),
  created_at timestamptz not null default now(),
  unique (room_id, visitor_id, task_date)
);

drop index if exists jh_room_members_rank_idx;
create index if not exists jh_room_members_rank_v2_idx
  on jh_room_members(room_id, verified desc, season_points desc, composite_score desc, joined_at asc);
create index if not exists jh_room_task_attempts_room_idx
  on jh_room_task_attempts(room_id, task_date desc);
