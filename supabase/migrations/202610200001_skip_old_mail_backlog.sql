-- 001_skip_old_mail_backlog.sql
--
-- WHAT IT DOES
--   Marks every waiting (status = 'pending') row in public.mail_outbox as 'skipped', EXCEPT 'enrolled' rows,
--   so the old backlog built up during the dry run (about 1,330 rows, 13 to 19 Oct 2026) is never sent when
--   the msc-mail Worker goes live. Nothing is deleted: the rows stay as an audit trail, with the reason in
--   last_error and the moment of the skip in processed_at.
--   Decision: Padam, 20 Oct 2026, "skip the old backlog, just send the enrolment mails".
--
-- CUTOFF
--   now() at the moment you run this file. Every pending non-enrolled row created before that moment is
--   skipped. Rows created after it are new activity and are processed once DRY_RUN = "0".
--
-- WHEN TO RUN
--   Right before deploying the Worker with DRY_RUN = "0", in the same sitting (minutes apart, not hours).
--   Run checks/1_before.sql first and note the numbers.
--
-- SAFETY GUARDS (the whole block rolls back, nothing changes, if any of them trips)
--   - Refuses to run after 3 Nov 2026: it is a one-off and must never be replayed later.
--   - Refuses if it would skip more than 5,000 rows (expected: roughly 1,300 to 2,000).
--
-- REVERSIBLE
--   Yes: rollback/undo_001_skip_old_mail_backlog.sql puts exactly these rows back to 'pending'
--   (matched by the last_error text below). Only undo while DRY_RUN = "1", or every row is sent at once.
--
-- To also keep the one 'placed' row (alumni congratulations mail), change
--   event <> 'enrolled'   to   event not in ('enrolled', 'placed')

do $$
declare
  reason constant text := 'skipped: pre-go-live backlog (Padam 2026-10-20: skip old, send enrolment only)';
  n_skip integer;
begin
  if now() > timestamptz '2026-11-03 23:59:59+05:30' then
    raise exception 'One-off script from 20 Oct 2026; refusing to run after 3 Nov 2026. Ask before reusing it.';
  end if;

  update public.mail_outbox
     set status       = 'skipped',
         last_error   = reason,
         processed_at = now()
   where status = 'pending'
     and event <> 'enrolled'
     and created_at < now();
  get diagnostics n_skip = row_count;

  if n_skip > 5000 then
    raise exception 'Would skip % rows (expected about 1,300 to 2,000). Nothing was changed. Check checks/1_before.sql.', n_skip;
  end if;

  raise notice 'Skipped % rows.', n_skip;
end $$;

-- What is still waiting. Expected: only 'enrolled' (8, or more if someone enrolled since).
select event, count(*) as rows_waiting
  from public.mail_outbox
 where status = 'pending'
 group by event
 order by event;
