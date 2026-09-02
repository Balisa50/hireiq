# Restoring the database

The Supabase project this app ran on (`twcitgaqfzqrlxdrunfx`) was deleted. The
hostname no longer resolves, so every data operation fails. The Vercel frontend
and the Render backend are both still healthy and still serving; only the
database underneath them is gone.

Nothing in this repository can bring it back, because the data lived only in
that project and there is no backup of it. What follows recreates the schema on
a new project so the application runs again, with an empty database.

## What is lost and what is not

Lost: every company, job and interview row, and every uploaded candidate
document. There is no export of any of it.

Not lost: the schema, the storage bucket definition, and the application. All
three are in this repository and are recreated by the steps below.

## Steps

**1. Create a new Supabase project.** Free tier is sufficient. Note the region;
put it near your users rather than near you.

**2. Apply the schema.** Open the SQL editor in the new project and run
`supabase/schema.sql` in full. It creates the three tables, enables row level
security on all of them, defines the six policies, and creates the private
`interview-documents` storage bucket.

The bucket line matters. It was missing from the schema until now, so a restore
that only recreated the tables produced a project where the app started
normally and file upload failed at runtime with a missing-bucket error.

**3. Collect four values** from Project Settings > API:

- Project URL
- `anon` public key
- `service_role` key, which is a secret and bypasses row level security
- Any strong random string for `SECRET_KEY`, for example
  `python -c "import secrets; print(secrets.token_urlsafe(48))"`

**4. Set the backend variables on Render.** The first four have no defaults and
the process exits on startup without them:

```
SECRET_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Note the name is `SUPABASE_SERVICE_ROLE_KEY`, not `SUPABASE_SERVICE_KEY`. The
README carried the wrong name for a while and it is the kind of error that
presents as an unexplained boot failure.

**5. Set the frontend variables on Vercel:**

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL      # the Render backend URL, no trailing slash
```

**6. Redeploy both**, then verify rather than assume:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<backend>/health
```

That endpoint checks its dependencies, so a 200 means the backend can reach the
new database. Then create a company, post a job, open the public link and
submit one interview with a file attached. The upload is the step that proves
the bucket exists, and it is the one that silently failed before.

## Avoiding a repeat

The deletion went unnoticed for roughly six weeks because nothing was watching.
An uptime check now runs every fifteen minutes in `Balisa50.github.io` and opens
an issue when any deployment stops answering, which arrives as an email.

The remaining exposure is that a free Supabase project pauses after a period of
inactivity and is eventually removed. If this app is meant to stay reachable,
either keep it in use or accept that it will need restoring again, and treat
the data in it as disposable until there is a backup worth the name.
