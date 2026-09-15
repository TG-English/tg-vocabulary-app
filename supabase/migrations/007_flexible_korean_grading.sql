-- Flexible Korean meaning grading with safe staff review.
begin;

alter table public.attempt_answers
  add column if not exists grading_status text not null default 'wrong';

alter table public.attempt_answers
  drop constraint if exists attempt_answers_grading_status_check;

alter table public.attempt_answers
  add constraint attempt_answers_grading_status_check
  check (grading_status in ('correct','wrong','review'));

update public.attempt_answers
set grading_status = case when is_correct then 'correct' else 'wrong' end;

create or replace function public.answer_parts(value text)
returns table(part text)
language sql immutable set search_path = public
as $$
  select trim(piece)
  from regexp_split_to_table(coalesce(value,''), '[,，/·;\n\r]+|[[:space:]]+또는[[:space:]]+') piece
  where public.normalize_answer(piece) <> ''
$$;

create or replace function public.korean_stem(value text)
returns text language sql immutable set search_path = public
as $$
  select regexp_replace(
    public.normalize_answer(regexp_replace(coalesce(value,''), '\([^)]*\)', '', 'g')),
    '(시키다|하는것|하다|하는|하여|해서|한|하기)$', '', 'g'
  )
$$;

create or replace function public.known_korean_synonyms(left_value text, right_value text)
returns boolean language sql immutable set search_path = public
as $$
  with pairs(a,b) as (values
    ('개선','향상'), ('수익','수입'), ('수익','이익'), ('수입','이익'),
    ('구매하다','구입하다'), ('시작하다','개시하다')
  )
  select exists(
    select 1 from pairs
    where (public.normalize_answer(a)=public.normalize_answer(left_value) and public.normalize_answer(b)=public.normalize_answer(right_value))
       or (public.normalize_answer(b)=public.normalize_answer(left_value) and public.normalize_answer(a)=public.normalize_answer(right_value))
  )
$$;

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
  answer_status text;
  submitted_count int;
  matched_count int;
  possible_review boolean;
  right_count int := 0;
  item_count int := 0;
  expected_count int;
begin
  select * into current_attempt from public.test_attempts
    where id=p_attempt_id and student_id=auth.uid() and status='in_progress' for update;
  if current_attempt.id is null then raise exception 'Attempt is unavailable'; end if;
  select * into exam from public.tests where id=current_attempt.test_id;
  if not exam.is_published or exam.academy_id is distinct from public.my_academy_id()
    or (exam.available_from is not null and now()<exam.available_from)
    or (exam.available_until is not null and now()>exam.available_until)
    or not exists(select 1 from public.test_assignments a where a.test_id=exam.id and a.student_id=auth.uid())
  then raise exception 'Exam is not available for submission'; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'Answers must be an array'; end if;
  select count(*) into expected_count from public.test_questions where test_id=exam.id;
  if expected_count<>exam.question_count or expected_count=0
    or jsonb_array_length(p_answers)<>expected_count
    or (select count(distinct a->>'question_id') from jsonb_array_elements(p_answers) a)<>expected_count
  then raise exception 'All exam questions must be answered once'; end if;

  delete from public.attempt_answers where attempt_id=p_attempt_id;
  for answer_item in select * from jsonb_array_elements(p_answers) loop
    select q.id,w.id as word_id,w.english,w.korean,
      coalesce(w.accepted_answers,'{}'::text[])||coalesce(q.accepted_answers,'{}'::text[]) accepted_answers,
      coalesce(q.question_type,exam.test_type) effective_type
    into question_row
    from public.test_questions q join public.vocabulary_words w on w.id=q.word_id
    where q.id=(answer_item->>'question_id')::uuid and q.test_id=exam.id;
    if question_row.id is null then raise exception 'Invalid question'; end if;
    submitted:=coalesce(answer_item->>'answer','');
    expected:=case when question_row.effective_type='en_ko' then question_row.korean else question_row.english end;
    answer_status:='wrong';

    if question_row.effective_type='en_ko' then
      select count(*) into submitted_count from public.answer_parts(submitted);
      select count(*) into matched_count
      from public.answer_parts(submitted) s
      where exists(
        select 1 from (
          select part from public.answer_parts(expected)
          union all select unnest(question_row.accepted_answers)
        ) accepted
        where public.normalize_answer(accepted.part)=public.normalize_answer(s.part)
           or public.known_korean_synonyms(accepted.part,s.part)
      );
      select exists(
        select 1 from public.answer_parts(submitted) s,
          (select part from public.answer_parts(expected) union all select unnest(question_row.accepted_answers)) accepted
        where public.korean_stem(s.part)<>''
          and public.korean_stem(s.part)=public.korean_stem(accepted.part)
          and public.normalize_answer(s.part)<>public.normalize_answer(accepted.part)
      ) into possible_review;
      if submitted_count>0 and matched_count=submitted_count then answer_status:='correct';
      elsif matched_count>0 or possible_review then answer_status:='review'; end if;
    else
      if public.normalize_answer(submitted)<>'' and public.normalize_answer(submitted)=public.normalize_answer(expected)
      then answer_status:='correct'; end if;
    end if;

    answer_is_correct:=answer_status='correct';
    insert into public.attempt_answers(attempt_id,question_id,submitted_answer,correct_answer_snapshot,is_correct,grading_status)
      values(p_attempt_id,question_row.id,submitted,expected,answer_is_correct,answer_status);
    item_count:=item_count+1;
    if answer_is_correct then right_count:=right_count+1; end if;
  end loop;
  update public.test_attempts set status='submitted',score=round((right_count::numeric/item_count)*100)::int,
    correct_count=right_count,total_count=item_count,submitted_at=now() where id=p_attempt_id;
  return query select round((right_count::numeric/item_count)*100)::int,right_count,item_count;
end
$$;

create or replace function public.review_attempt_answer(p_answer_id uuid,p_is_correct boolean,p_save_as_accepted boolean default false)
returns void language plpgsql security definer set search_path=public
as $$
declare target record;
begin
  select aa.id,aa.attempt_id,aa.submitted_answer,q.word_id,t.class_id
  into target from public.attempt_answers aa
  join public.test_questions q on q.id=aa.question_id
  join public.tests t on t.id=q.test_id where aa.id=p_answer_id;
  if target.id is null then raise exception 'Answer not found'; end if;
  if not (public.is_admin() or public.teaches_class(target.class_id)) then raise exception 'Not allowed'; end if;
  update public.attempt_answers set is_correct=p_is_correct,
    grading_status=case when p_is_correct then 'correct' else 'wrong' end where id=p_answer_id;
  if p_is_correct and p_save_as_accepted and public.normalize_answer(target.submitted_answer)<>'' then
    update public.vocabulary_words set accepted_answers=array(
      select distinct value from unnest(coalesce(accepted_answers,'{}'::text[])||array[target.submitted_answer]) value
    ) where id=target.word_id;
  end if;
  update public.test_attempts a set
    correct_count=(select count(*) from public.attempt_answers aa where aa.attempt_id=a.id and aa.is_correct),
    total_count=(select count(*) from public.attempt_answers aa where aa.attempt_id=a.id),
    score=round(100.0*(select count(*) from public.attempt_answers aa where aa.attempt_id=a.id and aa.is_correct)
      / greatest((select count(*) from public.attempt_answers aa where aa.attempt_id=a.id),1))::int
  where a.id=target.attempt_id;
end
$$;

create or replace function public.tg_exam_features()
returns jsonb language sql stable set search_path=public
as $$ select jsonb_build_object('mixed_questions',true,'duplicate_meanings',true,'flexible_grading',true) $$;

revoke all on function public.answer_parts(text) from public;
revoke all on function public.korean_stem(text) from public;
revoke all on function public.known_korean_synonyms(text,text) from public;
revoke all on function public.review_attempt_answer(uuid,boolean,boolean) from public;
grant execute on function public.answer_parts(text) to authenticated;
grant execute on function public.korean_stem(text) to authenticated;
grant execute on function public.known_korean_synonyms(text,text) to authenticated;
grant execute on function public.review_attempt_answer(uuid,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
