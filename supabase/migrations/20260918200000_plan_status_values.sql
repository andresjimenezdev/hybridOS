-- PostgreSQL requires newly-added enum values to be committed before a later
-- migration can use them in functions or data changes.
alter type public.planned_session_status add value if not exists 'in_progress';
alter type public.planned_session_status add value if not exists 'skipped';
