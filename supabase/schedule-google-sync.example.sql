-- Run only after replacing the two placeholders and setting the same token as
-- GOOGLE_SYNC_JOB_TOKEN in Supabase Edge Function secrets. This is an example,
-- not an automatic migration. Supabase Cron and Vault must be enabled.
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co', 'mmbl_project_url'
);
select vault.create_secret(
  'YOUR_LONG_RANDOM_GOOGLE_SYNC_JOB_TOKEN', 'mmbl_google_sync_job_token'
);

select cron.schedule(
  'mmbl-google-calendar-sync',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
              where name = 'mmbl_project_url') || '/functions/v1/google-calendar-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets
           where name = 'mmbl_google_sync_job_token')
      ),
      body := '{}'::jsonb
    );
  $$
);
