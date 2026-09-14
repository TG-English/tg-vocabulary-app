-- Run once in Supabase SQL Editor to enable DAY-based exam ranges.

alter table public.vocabulary_words
  add column if not exists day_number int;

alter table public.vocabulary_words
  drop constraint if exists vocabulary_words_day_number_check;

alter table public.vocabulary_words
  add constraint vocabulary_words_day_number_check
  check (day_number is null or day_number > 0);

create index if not exists idx_words_book_day
  on public.vocabulary_words(book_id, day_number, position);
