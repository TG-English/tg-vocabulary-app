-- TG Vocabulary App initial schema
-- Run in a new Supabase project. Safe to keep in GitHub: no keys or student data.

create extension if not exists pgcrypto;

create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.test_type as enum ('en_ko', 'ko_en', 'spelling');
create type public.attempt_status as enum ('in_progress', 'submitted');

create table public.academies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  academy_id uuid not null references public.academies(id) on delete cascade,
  role public.user_role not null default 'student',
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  name text not null,
  school_year int not null default extract(year from now())::int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (academy_id, name, school_year)
);

create table public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  primary key (class_id, teacher_id)
);

create table public.class_students (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_number text,
  joined_at date not null default current_date,
  is_active boolean not null default true,
  primary key (class_id, student_id)
);

create table public.vocabulary_books (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  title text not null,
  description text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vocabulary_words (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.vocabulary_books(id) on delete cascade,
  english text not null,
  korean text not null,
  accepted_answers text[] not null default '{}',
  position int not null,
  created_at timestamptz not null default now(),
  unique (book_id, position)
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  book_id uuid not null references public.vocabulary_books(id),
  created_by uuid not null references public.profiles(id),
  title text not null,
  test_type public.test_type not null,
  question_count int not null check (question_count > 0),
  pass_score int not null default 80 check (pass_score between 0 and 100),
  available_from timestamptz,
  available_until timestamptz,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.test_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  word_id uuid not null references public.vocabulary_words(id),
  position int not null,
  unique (test_id, position),
  unique (test_id, word_id)
);

create table public.test_assignments (
  test_id uuid not null references public.tests(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (test_id, student_id)
);

create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attempt_number int not null default 1 check (attempt_number > 0),
  status public.attempt_status not null default 'in_progress',
  score int check (score between 0 and 100),
  correct_count int not null default 0,
  total_count int not null default 0,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (test_id, student_id, attempt_number)
);

create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.test_attempts(id) on delete cascade,
  question_id uuid not null references public.test_questions(id),
  submitted_answer text not null,
  correct_answer_snapshot text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index idx_profiles_academy_role on public.profiles(academy_id, role);
create index idx_class_students_student on public.class_students(student_id);
create index idx_class_teachers_teacher on public.class_teachers(teacher_id);
create index idx_words_book on public.vocabulary_words(book_id, position);
create index idx_attempts_student on public.test_attempts(student_id, submitted_at desc);
create index idx_attempts_test on public.test_attempts(test_id, submitted_at desc);

create or replace function public.my_academy_id()
returns uuid language sql stable security definer set search_path = public
as $$ select academy_id from public.profiles where id = auth.uid() and is_active $$;

create or replace function public.my_role()
returns public.user_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and is_active $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'admin', false) $$;

create or replace function public.teaches_class(target_class uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.class_teachers where class_id = target_class and teacher_id = auth.uid()) $$;

create or replace function public.student_in_taught_class(target_student uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.class_students cs
    join public.class_teachers ct on ct.class_id = cs.class_id
    where cs.student_id = target_student and ct.teacher_id = auth.uid() and cs.is_active
  )
$$;

alter table public.academies enable row level security;
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_students enable row level security;
alter table public.vocabulary_books enable row level security;
alter table public.vocabulary_words enable row level security;
alter table public.tests enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_assignments enable row level security;
alter table public.test_attempts enable row level security;
alter table public.attempt_answers enable row level security;

create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.is_admin() or public.student_in_taught_class(id)
);
create policy profiles_admin_write on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy classes_select on public.classes for select using (
  academy_id = public.my_academy_id() and (
    public.is_admin() or public.teaches_class(id) or
    exists(select 1 from public.class_students cs where cs.class_id = id and cs.student_id = auth.uid() and cs.is_active)
  )
);
create policy classes_admin_write on public.classes for all using (public.is_admin()) with check (public.is_admin() and academy_id = public.my_academy_id());

create policy class_teachers_select on public.class_teachers for select using (
  public.is_admin() or teacher_id = auth.uid() or public.teaches_class(class_id)
);
create policy class_teachers_admin_write on public.class_teachers for all using (public.is_admin()) with check (public.is_admin());

create policy class_students_select on public.class_students for select using (
  public.is_admin() or student_id = auth.uid() or public.teaches_class(class_id)
);
create policy class_students_teacher_write on public.class_students for all using (
  public.is_admin() or public.teaches_class(class_id)
) with check (public.is_admin() or public.teaches_class(class_id));

create policy books_select on public.vocabulary_books for select using (academy_id = public.my_academy_id());
create policy books_teacher_write on public.vocabulary_books for all using (
  public.is_admin() or (public.my_role() = 'teacher' and owner_id = auth.uid())
) with check (academy_id = public.my_academy_id() and (public.is_admin() or owner_id = auth.uid()));

create policy words_select on public.vocabulary_words for select using (
  exists(select 1 from public.vocabulary_books b where b.id = book_id and b.academy_id = public.my_academy_id())
);
create policy words_teacher_write on public.vocabulary_words for all using (
  exists(select 1 from public.vocabulary_books b where b.id = book_id and (public.is_admin() or b.owner_id = auth.uid()))
) with check (
  exists(select 1 from public.vocabulary_books b where b.id = book_id and (public.is_admin() or b.owner_id = auth.uid()))
);

create policy tests_select on public.tests for select using (
  public.is_admin() or public.teaches_class(class_id) or
  exists(select 1 from public.test_assignments a where a.test_id = id and a.student_id = auth.uid())
);
create policy tests_teacher_write on public.tests for all using (
  public.is_admin() or public.teaches_class(class_id)
) with check (academy_id = public.my_academy_id() and (public.is_admin() or public.teaches_class(class_id)));

create policy questions_select on public.test_questions for select using (
  exists(select 1 from public.tests t where t.id = test_id and (public.is_admin() or public.teaches_class(t.class_id))) or
  exists(select 1 from public.test_assignments a where a.test_id = test_id and a.student_id = auth.uid())
);
create policy questions_teacher_write on public.test_questions for all using (
  exists(select 1 from public.tests t where t.id = test_id and (public.is_admin() or public.teaches_class(t.class_id)))
) with check (
  exists(select 1 from public.tests t where t.id = test_id and (public.is_admin() or public.teaches_class(t.class_id)))
);

create policy assignments_select on public.test_assignments for select using (
  student_id = auth.uid() or public.is_admin() or
  exists(select 1 from public.tests t where t.id = test_id and public.teaches_class(t.class_id))
);
create policy assignments_teacher_write on public.test_assignments for all using (
  public.is_admin() or exists(select 1 from public.tests t where t.id = test_id and public.teaches_class(t.class_id))
) with check (
  public.is_admin() or exists(select 1 from public.tests t where t.id = test_id and public.teaches_class(t.class_id))
);

create policy attempts_select on public.test_attempts for select using (
  student_id = auth.uid() or public.is_admin() or
  exists(select 1 from public.tests t where t.id = test_id and public.teaches_class(t.class_id))
);
create policy attempts_student_insert on public.test_attempts for insert with check (
  student_id = auth.uid() and exists(select 1 from public.test_assignments a where a.test_id = test_id and a.student_id = auth.uid())
);
create policy answers_select on public.attempt_answers for select using (
  exists(select 1 from public.test_attempts a where a.id = attempt_id and (
    a.student_id = auth.uid() or public.is_admin() or
    exists(select 1 from public.tests t where t.id = a.test_id and public.teaches_class(t.class_id))
  ))
);

-- Grading is performed in the database. Students cannot submit is_correct or score values.
create or replace function public.normalize_answer(value text)
returns text language sql immutable set search_path = public
as $$ select lower(regexp_replace(trim(coalesce(value, '')), '[[:space:][:punct:]]+', '', 'g')) $$;

create or replace function public.submit_attempt(p_attempt_id uuid, p_answers jsonb)
returns table(score int, correct_count int, total_count int)
language plpgsql security definer set search_path = public
as $$
declare
  current_attempt public.test_attempts%rowtype;
  answer_item jsonb;
  question_row record;
  submitted text;
  expected text;
  answer_is_correct boolean;
  right_count int := 0;
  item_count int := 0;
begin
  select * into current_attempt from public.test_attempts
  where id = p_attempt_id and student_id = auth.uid() and status = 'in_progress'
  for update;

  if current_attempt.id is null then
    raise exception 'Attempt is unavailable';
  end if;

  delete from public.attempt_answers where attempt_id = p_attempt_id;

  for answer_item in select * from jsonb_array_elements(p_answers)
  loop
    select q.id, w.english, w.korean, w.accepted_answers, t.test_type
      into question_row
    from public.test_questions q
    join public.vocabulary_words w on w.id = q.word_id
    join public.tests t on t.id = q.test_id
    where q.id = (answer_item->>'question_id')::uuid
      and q.test_id = current_attempt.test_id;

    if question_row.id is null then
      raise exception 'Invalid question';
    end if;

    submitted := coalesce(answer_item->>'answer', '');
    expected := case when question_row.test_type = 'en_ko' then question_row.korean else question_row.english end;
    answer_is_correct := public.normalize_answer(submitted) = public.normalize_answer(expected);

    if question_row.test_type = 'en_ko' and not answer_is_correct then
      answer_is_correct := exists(
        select 1 from unnest(question_row.accepted_answers) accepted
        where public.normalize_answer(accepted) = public.normalize_answer(submitted)
      );
    end if;

    insert into public.attempt_answers(
      attempt_id, question_id, submitted_answer, correct_answer_snapshot, is_correct
    ) values (p_attempt_id, question_row.id, submitted, expected, answer_is_correct);

    item_count := item_count + 1;
    if answer_is_correct then right_count := right_count + 1; end if;
  end loop;

  if item_count = 0 then raise exception 'No answers submitted'; end if;

  update public.test_attempts
  set status = 'submitted',
      score = round((right_count::numeric / item_count) * 100)::int,
      correct_count = right_count,
      total_count = item_count,
      submitted_at = now()
  where id = p_attempt_id;

  return query select round((right_count::numeric / item_count) * 100)::int, right_count, item_count;
end
$$;

revoke all on function public.my_academy_id() from public;
revoke all on function public.my_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.teaches_class(uuid) from public;
revoke all on function public.student_in_taught_class(uuid) from public;
grant execute on function public.my_academy_id() to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.teaches_class(uuid) to authenticated;
grant execute on function public.student_in_taught_class(uuid) to authenticated;
revoke all on function public.normalize_answer(text) from public;
revoke all on function public.submit_attempt(uuid, jsonb) from public;
grant execute on function public.normalize_answer(text) to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;
