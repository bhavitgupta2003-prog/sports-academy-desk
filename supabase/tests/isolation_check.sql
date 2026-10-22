-- ACCOUNT ISOLATION CHECK. Safe to run: it uses two made-up users inside one block that ALWAYS
-- ends in an error on purpose, so Supabase rolls everything back. Nothing is saved or changed.
-- Run in Supabase: SQL Editor > New query > paste > Run.
-- The red error box at the end is expected: read the PASS / FAIL lines inside it.
--
-- BEFORE migration 001 you should see FAIL on the three "cross-account link" lines (that is the
-- risk). AFTER migration 001 every line should say PASS.
--
-- How to read the report:
--   PASS              the database did what we want.
--   FAIL              the database allowed something it should not.
--   UNEXPECTED ERROR  that test hit a DIFFERENT error than the one it expects (the code is shown),
--                     so it proves nothing either way. Send the line to whoever is helping you.
-- If you get a red error that does NOT start with "ISOLATION CHECK RESULTS", the script itself
-- could not run (for example a permission problem). That is not a security finding, and nothing
-- was saved.

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  batch_b uuid; student_b uuid;
  n bigint;
  report text := '';
begin
  insert into auth.users (id, email) values (a, 'check-a@example.invalid'), (b, 'check-b@example.invalid');

  -- ----- act as account B: create a batch and a student -----
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into batches (name) values ('B batch') returning id into batch_b;
  insert into students (name, batch_id, coach, parent_phone, monthly_fee)
    values ('B student', batch_b, 'coach', '9999999999', 1000) returning id into student_b;

  -- ----- act as account A -----
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  select count(*) into n from batches where id = batch_b;
  report := report || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ': A cannot read B''s batch';
  select count(*) into n from students where id = student_b;
  report := report || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ': A cannot read B''s student';

  update batches set name = 'hacked' where id = batch_b;
  get diagnostics n = row_count;
  report := report || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ': A cannot change B''s batch';
  delete from students where id = student_b;
  get diagnostics n = row_count;
  report := report || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ': A cannot delete B''s student';

  -- A tries to create a row that claims to belong to B (the privacy rule must refuse: error 42501).
  begin
    insert into batches (owner_id, name) values (b, 'spoofed owner');
    report := report || E'\nFAIL: A could create a batch owned by B';
  exception
    when insufficient_privilege then
      report := report || E'\nPASS: A cannot create rows owned by B';
    when others then
      report := report || E'\nUNEXPECTED ERROR (' || sqlstate || E') in the "create row owned by B" test';
  end;

  -- Cross-account links: each must be refused by a foreign key (error 23503), and only that error counts.
  begin
    insert into students (name, batch_id, coach, parent_phone, monthly_fee) values ('x', batch_b, 'c', '9999999999', 1);
    report := report || E'\nFAIL: cross-account link: A put a student into B''s batch';
  exception
    when foreign_key_violation then
      report := report || E'\nPASS: cross-account link blocked for students -> batches';
    when others then
      report := report || E'\nUNEXPECTED ERROR (' || sqlstate || E') in the students -> batches test';
  end;
  begin
    insert into attendance (student_id, date, status) values (student_b, current_date, 'present');
    report := report || E'\nFAIL: cross-account link: A added attendance for B''s student';
  exception
    when foreign_key_violation then
      report := report || E'\nPASS: cross-account link blocked for attendance -> students';
    when others then
      report := report || E'\nUNEXPECTED ERROR (' || sqlstate || E') in the attendance -> students test';
  end;
  begin
    insert into fee_payments (student_id, amount) values (student_b, 1);
    report := report || E'\nFAIL: cross-account link: A added a payment for B''s student';
  exception
    when foreign_key_violation then
      report := report || E'\nPASS: cross-account link blocked for fee_payments -> students';
    when others then
      report := report || E'\nUNEXPECTED ERROR (' || sqlstate || E') in the fee_payments -> students test';
  end;

  -- ----- logged out (anonymous) -----
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from students;
  report := report || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ': logged-out visitor sees no students';
  begin
    insert into batches (name) values ('anon batch');
    report := report || E'\nFAIL: logged-out visitor could add a batch';
  exception
    when insufficient_privilege then
      report := report || E'\nPASS: logged-out visitor cannot add a batch';
    when others then
      report := report || E'\nUNEXPECTED ERROR (' || sqlstate || E') in the logged-out insert test';
  end;

  reset role;
  raise exception 'ISOLATION CHECK RESULTS (nothing was saved):%', report;
end $$;
