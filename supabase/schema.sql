-- Full schema for a FRESH Supabase project. Run once: SQL Editor > New query > paste > Run.
-- (Already have the first version? Run supabase/migrations/001_same_account_references.sql instead.)
-- Links between tables also require the same owner_id, so one account can never point at another's rows.
create table batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  unique (id, owner_id)
);

create table students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  batch_id uuid not null,
  coach text not null,
  parent_name text,
  parent_phone text not null,
  monthly_fee numeric(10,2) not null check (monthly_fee >= 0),
  joined_on date not null default current_date,
  unique (id, owner_id),
  foreign key (batch_id, owner_id) references batches (id, owner_id)
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null,
  date date not null,
  status text not null check (status in ('present', 'absent')),
  unique (student_id, date),
  foreign key (student_id, owner_id) references students (id, owner_id) on delete cascade
);

create table fee_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null,
  amount numeric(10,2) not null check (amount > 0),
  paid_on date not null default current_date,
  note text,
  foreign key (student_id, owner_id) references students (id, owner_id) on delete cascade
);

-- Row Level Security: each login can only see and change its own rows.
alter table batches enable row level security;
alter table students enable row level security;
alter table attendance enable row level security;
alter table fee_payments enable row level security;

create policy "own rows" on batches for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own rows" on students for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own rows" on attendance for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own rows" on fee_payments for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
