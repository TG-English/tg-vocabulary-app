# Security and privacy checklist

- Never commit `.env`, service-role keys, student exports, or password files.
- The frontend may use only `VITE_SUPABASE_ANON_KEY`; it is public by design and still protected by RLS.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_` variable or browser bundle.
- Create users through an administrator-only server function, not by embedding temporary passwords in code.
- Require password reset on initial invitation.
- Use UUIDs in URLs; do not place student names in URLs.
- Keep sample data marked `is_sample = true` and use fictional names only.
- Exported CSV files are downloaded locally and must not be committed.
- Disable or anonymize accounts for withdrawn students according to academy retention policy.
- Review RLS policies after every database migration.
- Students submit raw answers through `submit_attempt`; the database calculates correctness and score. The browser cannot write its own score.
