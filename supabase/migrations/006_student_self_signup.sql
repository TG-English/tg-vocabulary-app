-- Student self-signup with a class code and explicit admin approval.

alter table public.classes add column if not exists signup_code text;

create unique index if not exists classes_signup_code_unique
  on public.classes (upper(signup_code))
  where signup_code is not null;

alter table public.classes drop constraint if exists classes_signup_code_format;
alter table public.classes add constraint classes_signup_code_format
  check (signup_code is null or signup_code ~ '^[A-Z0-9-]{4,30}$');

create or replace function public.validate_class_signup_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.classes
    where is_active and upper(signup_code) = upper(trim(p_code))
  )
$$;

revoke all on function public.validate_class_signup_code(text) from public;
grant execute on function public.validate_class_signup_code(text) to anon, authenticated;

create or replace function public.handle_student_self_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_code text := upper(trim(coalesce(new.raw_user_meta_data->>'class_code', '')));
  requested_name text := trim(coalesce(new.raw_user_meta_data->>'display_name', ''));
  target_class public.classes%rowtype;
begin
  -- Accounts issued by an administrator do not include class_code and keep the existing flow.
  if requested_code = '' then return new; end if;
  if requested_name = '' or length(requested_name) > 40 then
    raise exception 'Invalid student name';
  end if;

  select * into target_class
  from public.classes
  where is_active and upper(signup_code) = requested_code;

  if target_class.id is null then raise exception 'Invalid class signup code'; end if;

  insert into public.profiles(id,academy_id,role,display_name,is_active)
  values(new.id,target_class.academy_id,'student',requested_name,false);

  insert into public.class_students(class_id,student_id,is_active)
  values(target_class.id,new.id,false);
  return new;
end
$$;

drop trigger if exists on_student_self_signup on auth.users;
create trigger on_student_self_signup
  after insert on auth.users
  for each row execute function public.handle_student_self_signup();

revoke all on function public.handle_student_self_signup() from public;
