create table if not exists jh_video_generations (
  generation_id uuid primary key,
  visitor_id uuid not null references jh_visitors(visitor_id) on delete cascade,
  provider_task_id varchar(96) unique,
  quota_date date not null,
  character varchar(16) not null check (character in ('nailoong', 'jiahao')),
  aspect_ratio varchar(8) not null check (aspect_ratio in ('1:1', '3:4', '16:9')),
  status varchar(16) not null check (status in ('submitting', 'queued', 'running', 'succeeded', 'failed', 'expired')),
  video_url text,
  error_code varchar(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (visitor_id, quota_date)
);

create index if not exists jh_video_generations_status_idx
  on jh_video_generations(status, updated_at desc);
create index if not exists jh_video_generations_character_idx
  on jh_video_generations(character, created_at desc);
