create table if not exists jh_product_events (
  event_id uuid primary key,
  visitor_id uuid,
  session_id uuid,
  event_name varchar(48) not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists jh_product_events_funnel_idx
  on jh_product_events(event_name, created_at desc);
