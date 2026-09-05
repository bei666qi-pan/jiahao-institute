-- Hash-only reservations prevent duplicate generation across restarts; no dialogue or tokens.
create table if not exists jh_scene_requests (
  request_key char(64) primary key,
  attempt_hash char(64) not null,
  epoch uuid not null,
  status varchar(12) not null check(status in ('pending','completed','failed','uncertain')),
  expires_at timestamptz not null
);
create index if not exists jh_scene_requests_expiry on jh_scene_requests(expires_at);
