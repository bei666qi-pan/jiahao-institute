create table if not exists jh_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists jh_visitors (
  visitor_id uuid primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists jh_sessions (
  session_id uuid primary key,
  visitor_id uuid not null references jh_visitors(visitor_id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  page_views integer not null default 0 check (page_views >= 0),
  api_requests integer not null default 0 check (api_requests >= 0),
  landing_path text not null default '/',
  referrer_host text,
  device_category text not null default 'desktop'
);

create table if not exists jh_page_views (
  id bigint generated always as identity primary key,
  visitor_id uuid not null references jh_visitors(visitor_id) on delete cascade,
  session_id uuid not null references jh_sessions(session_id) on delete cascade,
  path text not null,
  occurred_at timestamptz not null default now()
);

create table if not exists jh_api_requests (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  visitor_id uuid references jh_visitors(visitor_id) on delete set null,
  session_id uuid references jh_sessions(session_id) on delete set null,
  endpoint text not null,
  mode text,
  provider text,
  model text,
  status_code smallint not null check (status_code between 100 and 599),
  ok boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  cached_input_tokens bigint check (cached_input_tokens >= 0),
  estimated_cost_micros bigint check (estimated_cost_micros >= 0),
  pricing_configured boolean not null default false,
  error_code text,
  error_message text,
  occurred_at timestamptz not null default now()
);

create table if not exists jh_daily_traffic (
  day date primary key,
  visitors bigint not null default 0,
  new_visitors bigint not null default 0,
  sessions bigint not null default 0,
  page_views bigint not null default 0,
  active_seconds bigint not null default 0,
  bounced_sessions bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists jh_daily_api (
  day date not null,
  provider text not null default 'unknown',
  model text not null default 'unknown',
  endpoint text not null,
  requests bigint not null default 0,
  successes bigint not null default 0,
  latency_ms_total bigint not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  estimated_cost_micros bigint not null default 0,
  priced_requests bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, provider, model, endpoint)
);

create table if not exists jh_admin_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists jh_sessions_started_at_idx on jh_sessions (started_at desc, session_id desc);
create index if not exists jh_sessions_visitor_started_idx on jh_sessions (visitor_id, started_at desc);
create index if not exists jh_page_views_session_idx on jh_page_views (session_id, occurred_at desc);
create index if not exists jh_page_views_occurred_idx on jh_page_views (occurred_at desc, id desc);
create index if not exists jh_api_requests_occurred_idx on jh_api_requests (occurred_at desc, id desc);
create index if not exists jh_api_requests_endpoint_occurred_idx on jh_api_requests (endpoint, occurred_at desc);
create index if not exists jh_api_requests_provider_occurred_idx on jh_api_requests (provider, model, occurred_at desc);
create index if not exists jh_api_requests_errors_idx on jh_api_requests (occurred_at desc) where ok = false;
create index if not exists jh_api_requests_session_idx on jh_api_requests (session_id, occurred_at desc) where session_id is not null;
create index if not exists jh_admin_sessions_active_idx on jh_admin_sessions (expires_at) where revoked_at is null;
