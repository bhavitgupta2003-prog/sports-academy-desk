-- MIGRATION 002: Events (a title and date, with an optional time, place, notes and batch).
-- NOT RUN YET. Run it once in Supabase: SQL Editor > New query > paste > Run.
--
-- What it does: creates ONE new table, "events", with the same privacy rule as your other tables
-- (each login sees and changes only its own rows). It does not change, move or delete any existing data.
-- Until you run it, the app works as before; the Events page just says the one-time setup is missing.
--
-- It is one all-or-nothing transaction, and it is safe whether or not migration 001 has been run.
-- Needs Postgres 15 or newer (every recent Supabase project has it). If Supabase reports a syntax error at
-- "set null (batch_id)", delete that clause: the only effect is that a batch with events cannot be deleted
-- until its events are deleted.

begin;

-- An event can point at a batch of the SAME account. For that, a batch must be identifiable by (id, owner_id).
-- Migration 001 adds this too, so only add it if it is not there yet.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'batches_id_owner_key' and conrelid = 'public.batches'::regclass
  ) then
    alter table public.batches add constraint batches_id_owner_key unique (id, owner_id);
  end if;
end $$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  event_date date not null,
  event_time time,
  location text check (location is null or char_length(location) <= 120),
  notes text check (notes is null or char_length(notes) <= 500),
  batch_id uuid, -- empty means "all batches"
  foreign key (batch_id, owner_id) references public.batches (id, owner_id) on delete set null (batch_id)
);

create index events_owner_date_idx on public.events (owner_id, event_date);

alter table public.events enable row level security;
create policy "own rows" on public.events for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

commit;

-- To undo (removes the events table and everything in it):
--   drop table public.events;
