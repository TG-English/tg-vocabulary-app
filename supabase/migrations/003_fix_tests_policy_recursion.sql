-- Fix: tests_select read test_assignments while assignment policies read tests,
-- causing "infinite recursion detected in policy for relation tests".
-- The definer helper breaks that RLS policy expansion cycle.
begin;

create or replace function public.is_assigned_to_test(target_test uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.test_assignments a
    where a.test_id = target_test
      and a.student_id = auth.uid()
  )
$$;

revoke all on function public.is_assigned_to_test(uuid) from public;
grant execute on function public.is_assigned_to_test(uuid) to authenticated;

drop policy if exists tests_select on public.tests;
create policy tests_select on public.tests
for select
using (
  academy_id = public.my_academy_id()
  and (
    public.is_admin()
    or public.teaches_class(class_id)
    or public.is_assigned_to_test(id)
  )
);

notify pgrst, 'reload schema';
commit;
