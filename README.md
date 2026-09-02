# HireIQ

Replaces static job application forms with a conversational AI. Candidates apply through a real conversation instead of filling out a form. Your hiring team gets a ranked, scored shortlist - and only talks to the people worth their time.

---

## Architecture

```
hireiq/
├── backend/          Python 3.11 + FastAPI + Pydantic v2
├── frontend/         Next.js 14 + TypeScript + Tailwind CSS
├── supabase/         SQL schema + RLS policies
```

| Layer | Technology |
|---|---|
| Database & Auth | Supabase (PostgreSQL + Row Level Security) |
| AI | NVIDIA's OpenAI-compatible endpoint. `nvidia/nemotron-3-super-120b-a12b` for scoring, question generation and the live interview stream, falling back to `nvidia/llama-3.3-nemotron-super-49b-v1.5`. The `groq_*` config names are legacy. Both paths ran on `mistral-medium-3.5-128b` until it reached end of life on 2026-08-07 and began answering 410. |
| PDF reports | WeasyPrint |
| Hosting | Vercel (frontend) + Render (backend, see `backend/render.yaml`) |

## How it works

1. Post a job - paste your description, HireIQ generates tailored questions calibrated to the role and seniority
2. Share one link - candidates click and apply immediately, no scheduling
3. AI talks to every applicant - follows up on weak answers, structures their responses
4. Review the shortlist - every completed application becomes a scored report with strengths, concerns, and a hiring recommendation

## Running locally

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # fill in your keys
uvicorn main:app --reload

# Frontend
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## Environment variables

Both `.env.example` files are the source of truth and are kept in step with
the code. The list below is what each side actually requires.

**Backend** (`backend/.env`). The first four have no defaults, so the process
exits on startup if any is missing.

```
SECRET_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NVIDIA_API_KEY=            # optional; AI calls fail with 401 rather than crashing
RESEND_API_KEY=            # optional; candidate emails are skipped without it
FRONTEND_URL=
```

**Frontend** (`frontend/.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=
```

## Live

[hireiq-ab.vercel.app](https://hireiq-ab.vercel.app)
