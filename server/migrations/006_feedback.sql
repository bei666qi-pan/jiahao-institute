create table if not exists jh_feedback (
  feedback_id uuid primary key,
  visitor_id uuid references jh_visitors(visitor_id) on delete set null,
  category varchar(24) not null check (category in ('experience', 'generation', 'bug', 'idea', 'other')),
  message text not null check (char_length(message) between 2 and 1000),
  contact varchar(120),
  created_at timestamptz not null default now()
);

create index if not exists jh_feedback_created_idx on jh_feedback(created_at desc);
