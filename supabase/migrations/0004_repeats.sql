-- Repeat suggestions. Run after 0003_checkin_depth.sql.

create table goal_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now()
);

create unique index goal_templates_user_title
  on goal_templates (user_id, lower(title));
alter table goal_templates enable row level security;
