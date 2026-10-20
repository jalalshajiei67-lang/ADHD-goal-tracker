-- Richer check-in responses. Run after 0002_trust.sql.

alter table goals add column next_step text
  check (next_step is null or char_length(next_step) between 1 and 160);

alter table checkins add column reason text
  check (reason is null or reason in ('blocked', 'too_big', 'not_now', 'forgot'));
