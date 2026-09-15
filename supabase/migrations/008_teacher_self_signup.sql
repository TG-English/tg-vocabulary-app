-- Teacher self-signup with explicit admin approval.
begin;

alter table public.profiles add column if not exists email text;

update public.profiles p
set email = lower(u.email)
from auth.users u
where u.id = p.id and p.email is null;

create or replace function public.handle_student_self_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_code text := upper(trim(coalesce(new.raw_user_meta_data->>'class_code', '')));
  requested_name text := trim(coalesce(new.raw_user_meta_data->>'display_name', ''));
  signup_type text := trim(coalesce(new.raw_user_meta_data->>'signup_type', ''));
  target_class public.classes%rowtype;
  target_academy_id uuid;
begin
  if signup_type = 'teacher_request' then
    if requested_name = '' or length(requested_name) > 40 then
      raise exception 'Invalid teacher name';
    end if;

    select min(academy_id::text)::uuid into target_academy_id
    from public.profiles
    where role = 'admin' and is_active;

    if target_academy_id is null or
       (select count(distinct academy_id) from public.profiles where role='admin' and is_active) <> 1 then
      raise exception 'Teacher signup academy is unavailable';
    end if;

    insert into public.profiles(id,academy_id,role,display_name,email,is_active)
    values(new.id,target_academy_id,'teacher',requested_name,lower(new.email),false);
    return new;
  end if;

  -- Accounts issued by an administrator do not include class_code and keep the existing flow.
  if requested_code = '' then return new; end if;
  if requested_name = '' or length(requested_name) > 40 then
    raise exception 'Invalid student name';
  end if;

  select * into target_class
  from public.classes
  where is_active and upper(signup_code) = requested_code;

  if target_class.id is null then raise exception 'Invalid class signup code'; end if;

  insert into public.profiles(id,academy_id,role,display_name,email,is_active)
  values(new.id,target_class.academy_id,'student',requested_name,lower(new.email),false);

  insert into public.class_students(class_id,student_id,is_active)
  values(target_class.id,new.id,false);
  return new;
end
$$;

revoke all on function public.handle_student_self_signup() from public;

commit;
