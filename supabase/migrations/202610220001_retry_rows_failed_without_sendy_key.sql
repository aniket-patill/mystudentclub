-- 002_retry_rows_failed_without_sendy_key.sql
--
-- WHAT IT DOES
--   After go-live (msc-mail version c1fdd430, deployed 2026-10-21 20:20 UTC) every row that needed Sendy failed
--   with "PermError: SENDY_API_KEY is not set": the Worker secret was never set, which the dry run hid.
--   Once the secret is set, this puts exactly those rows back to 'pending' so the Worker processes them again.
--   Covers the 9 enrolment rows plus any new activity that failed the same way since the deploy.
--
-- WHEN TO RUN
--   Only AFTER `npx wrangler secret put SENDY_API_KEY` (and `npx wrangler secret list` shows it).
--   Run earlier and the rows simply fail again.
--
-- SAFETY
--   Touches only status = 'failed' rows with that exact error, processed after the go-live deploy.
--   Refuses to run after 3 Nov 2026 (one-off).
--
-- REVERSIBLE
--   Not needed: it only retries rows that should have been processed. Handlers are idempotent (KV dedupe keys),
--   so a resource row whose SES copy already went out does not send a second copy.

do $$
declare
  n integer;
begin
  if now() > timestamptz '2026-11-03 23:59:59+05:30' then
    raise exception 'One-off script from 22 Oct 2026; refusing to run after 3 Nov 2026.';
  end if;

  update public.mail_outbox
     set status       = 'pending',
         attempts     = 0,
         last_error   = null,
         processed_at = null,
         locked_at    = null,
         not_before   = now()
   where status = 'failed'
     and last_error like '%SENDY_API_KEY is not set%'
     and processed_at >= timestamptz '2026-10-21 20:15:00+00';
  get diagnostics n = row_count;

  raise notice 'Back to pending: % rows.', n;
end $$;

-- What is waiting now (should include the 9 enrolled rows). They are picked up within a minute or two.
select event, count(*) as rows_waiting
  from public.mail_outbox
 where status = 'pending'
 group by event
 order by event;
