-- MIGRATION 001: make "same account" a database rule for links between tables.
-- NOT RUN YET. Run it once in Supabase: SQL Editor > New query > paste > Run.
--
-- Problem: students.batch_id, attendance.student_id and fee_payments.student_id only said
-- "this id must exist somewhere". Someone who knew another account's batch/student id could
-- point their own rows at it. This changes each link to also require the SAME owner_id.
--
-- Safe to run: it is one all-or-nothing transaction (if anything fails, nothing changes),
-- it does not add, change or delete any of your data, and your app code needs no change.

begin;

-- A parent row must be identifiable by (id, owner_id) so children can point at both.
alter table batches  add constraint batches_id_owner_key  unique (id, owner_id);
alter table students add constraint students_id_owner_key unique (id, owner_id);

-- students -> batches: the batch must belong to the same account.
alter table students drop constraint if exists students_batch_id_fkey;
alter table students add constraint students_batch_owner_fkey
  foreign key (batch_id, owner_id) references batches (id, owner_id);

-- attendance -> students: the student must belong to the same account.
alter table attendance drop constraint if exists attendance_student_id_fkey;
alter table attendance add constraint attendance_student_owner_fkey
  foreign key (student_id, owner_id) references students (id, owner_id) on delete cascade;

-- fee_payments -> students: the student must belong to the same account.
alter table fee_payments drop constraint if exists fee_payments_student_id_fkey;
alter table fee_payments add constraint fee_payments_student_owner_fkey
  foreign key (student_id, owner_id) references students (id, owner_id) on delete cascade;

commit;

-- To undo (only if ever needed):
--   alter table students     drop constraint students_batch_owner_fkey;
--   alter table attendance   drop constraint attendance_student_owner_fkey;
--   alter table fee_payments drop constraint fee_payments_student_owner_fkey;
--   alter table students     add constraint students_batch_id_fkey     foreign key (batch_id)   references batches(id);
--   alter table attendance   add constraint attendance_student_id_fkey foreign key (student_id) references students(id) on delete cascade;
--   alter table fee_payments add constraint fee_payments_student_id_fkey foreign key (student_id) references students(id) on delete cascade;
