-- Run once in Supabase SQL Editor to enable assigned mixed exams.
-- Existing exams, student accounts and scores are preserved.
begin;

alter table public.test_questions
  add column if not exists question_type public.test_type;

create or replace function public.submit_attempt(p_attempt_id uuid, p_answers jsonb)
returns table(score int, correct_count int, total_count int)
language plpgsql security definer set search_path = public
as $$
declare
  current_attempt public.test_attempts%rowtype;
  exam public.tests%rowtype;
  question_row record;
  answer_item jsonb;
  submitted text;
  expected text;
  answer_is_correct boolean;
  right_count int := 0;
  item_count int := 0;
  expected_count int;
begin
  select * into current_attempt from public.test_attempts
    where id = p_attempt_id and student_id = auth.uid() and status = 'in_progress'
    for update;
  if current_attempt.id is null then raise exception 'Attempt is unavailable'; end if;
  select * into exam from public.tests where id = current_attempt.test_id;
  if not exam.is_published or exam.academy_id is distinct from public.my_academy_id()
    or (exam.available_from is not null and now() < exam.available_from)
    or (exam.available_until is not null and now() > exam.available_until)
    or not exists(select 1 from public.test_assignments a where a.test_id = exam.id and a.student_id = auth.uid())
  then raise exception 'Exam is not available for submission'; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'Answers must be an array'; end if;
  select count(*) into expected_count from public.test_questions where test_id = exam.id;
  if expected_count <> exam.question_count or expected_count = 0
    or jsonb_array_length(p_answers) <> expected_count
    or (select count(distinct a->>'question_id') from jsonb_array_elements(p_answers) a) <> expected_count
  then raise exception 'All exam questions must be answered once'; end if;

  delete from public.attempt_answers where attempt_id = p_attempt_id;
  for answer_item in select * from jsonb_array_elements(p_answers)
  loop
    select q.id, w.english, w.korean, w.accepted_answers,
      coalesce(q.question_type, exam.test_type) as effective_type
    into question_row
    from public.test_questions q join public.vocabulary_words w on w.id = q.word_id
    where q.id = (answer_item->>'question_id')::uuid and q.test_id = exam.id;
    if question_row.id is null then raise exception 'Invalid question'; end if;
    submitted := coalesce(answer_item->>'answer', '');
    expected := case when question_row.effective_type = 'en_ko' then question_row.korean else question_row.english end;
    answer_is_correct := public.normalize_answer(submitted) <> ''
      and public.normalize_answer(submitted) = public.normalize_answer(expected);
    if question_row.effective_type = 'en_ko' and not answer_is_correct then
      answer_is_correct := public.normalize_answer(submitted) <> '' and exists(
        select 1 from unnest(question_row.accepted_answers) accepted
        where public.normalize_answer(accepted) = public.normalize_answer(submitted)
      );
    end if;
    insert into public.attempt_answers(attempt_id, question_id, submitted_answer, correct_answer_snapshot, is_correct)
      values (p_attempt_id, question_row.id, submitted, expected, answer_is_correct);
    item_count := item_count + 1;
    if answer_is_correct then right_count := right_count + 1; end if;
  end loop;
  update public.test_attempts set status = 'submitted',
    score = round((right_count::numeric / item_count) * 100)::int,
    correct_count = right_count, total_count = item_count, submitted_at = now()
    where id = p_attempt_id;
  return query select round((right_count::numeric / item_count) * 100)::int, right_count, item_count;
end
$$;

create or replace function public.tg_exam_features()
returns jsonb language sql stable set search_path = public
as $$ select jsonb_build_object('mixed_questions', true) $$;
revoke all on function public.tg_exam_features() from public;
grant execute on function public.tg_exam_features() to authenticated;
revoke all on function public.submit_attempt(uuid,jsonb) from public;
grant execute on function public.submit_attempt(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
