-- Heartbeat and login throttling. Run after 0001_init.sql.

alter table users add column last_tick_at timestamptz;
alter table users add column last_push_at timestamptz;

create table login_attempts (
  id           bigserial primary key,
  ip           text not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_ip_time on login_attempts (ip, attempted_at desc);
alter table login_attempts enable row level security;
