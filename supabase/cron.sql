-- Run in the Supabase SQL editor AFTER the app is deployed to Vercel.
-- Replace the two placeholders first:
--   <APP_URL>      e.g. https://prioritypulse-yourname.vercel.app
--   <CRON_SECRET>  the CRON_SECRET value from your .env.local / Vercel env vars

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'pulse_cron_secret');

select cron.schedule(
  'pulse-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := '<APP_URL>/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_cron_secret'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- Check it is running (wait 5+ minutes):
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content from net._http_response order by created desc limit 5;
-- Stop it:
--   select cron.unschedule('pulse-tick');
