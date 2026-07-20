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
| AI | NVIDIA's OpenAI-compatible endpoint (`mistral-medium-3.5-128b` for both scoring/question generation and the live interview stream). The `groq_*` config names are legacy. |
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
cp .env.local.example .env.local
npm run dev
```

## Environment variables

```
NVIDIA_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=
```

## Live

[hireiq-ab.vercel.app](https://hireiq-ab.vercel.app)
