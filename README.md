# HireIQ — AI-Powered Hiring Platform

HireIQ replaces static job application forms with intelligent AI conversational interviews. Every candidate gets interviewed. Your hiring team sees ranked, scored reports — and only talks to people worth their time.

---

## Architecture

```
hireiq/
├── backend/          Python 3.11 + FastAPI + Pydantic v2
├── frontend/         Next.js 14 + TypeScript + Tailwind CSS
├── supabase/         SQL schema + RLS policies
└── .gitignore
```

**Key services:**
| Layer | Technology |
|---|---|
| Database & Auth | Supabase (PostgreSQL + Row Level Security) |
| AI / LLM | Google Gemini Flash 2.0 |
| PDF Generation | WeasyPrint (server-side) |
| Rate Limiting | slowapi |
| Frontend hosting | Vercel |
| Backend hosting | Render |

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com) API key (Gemini)

---

## Quick Start

### 1. Clone and configure environment variables

```bash
git clone <repo-url> hireiq
cd hireiq
```

**Backend — `backend/.env`:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
SECRET_KEY=generate-with-openssl-rand-hex-32
```

**Frontend — `frontend/.env.local`:**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 2. Supabase schema

Run the contents of `supabase/schema.sql` in your Supabase SQL editor. This creates the `companies`, `jobs`, and `interviews` tables with all indexes and RLS policies.

### 3. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API will be available at `http://localhost:8000`.
Interactive docs (development only): `http://localhost:8000/docs`

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

App will be available at `http://localhost:3000`.

---

## Environment Variables Reference

### Backend

| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS for admin ops) | ✅ |
| `GEMINI_API_KEY` | Google Gemini API key for LLM inference | ✅ |
| `ENVIRONMENT` | `development` or `production` | ✅ |
| `FRONTEND_URL` | Frontend origin for CORS | ✅ |
| `SECRET_KEY` | 32-byte hex string for internal signing | ✅ |
| `RATE_LIMIT_GENERAL` | Requests per minute for general endpoints (default: `100/minute`) | ❌ |
| `RATE_LIMIT_INTERVIEW` | Requests per minute for interview endpoints (default: `30/minute`) | ❌ |
| `GROQ_TIMEOUT_SECONDS` | Groq API timeout (default: `15`) | ❌ |
| `MAX_JD_LENGTH` | Maximum job description characters (default: `10000`) | ❌ |
| `MAX_ANSWER_LENGTH` | Maximum candidate answer characters (default: `3000`) | ❌ |

### Frontend

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ |

---

## API Endpoints

### Public (no auth — candidates)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/interviews/public/job/{link_token}` | Get job info for interview welcome screen |
| `POST` | `/api/interviews/public/start` | Start or resume an interview session |
| `POST` | `/api/interviews/public/save-answer` | Auto-save an answer (called every 10 seconds) |
| `POST` | `/api/interviews/public/next-question` | Generate adaptive next question |
| `POST` | `/api/interviews/public/submit` | Submit interview and trigger AI scoring |

### Company (JWT auth required)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register a new company |
| `POST` | `/api/auth/login` | Sign in, returns JWT |
| `GET` | `/api/companies/me` | Get company profile |
| `PATCH` | `/api/companies/me` | Update company profile & settings |
| `GET` | `/api/companies/me/stats` | Dashboard stats |
| `GET` | `/api/jobs/` | List all jobs |
| `POST` | `/api/jobs/generate-questions` | Generate AI interview questions |
| `POST` | `/api/jobs/` | Publish a new job |
| `GET` | `/api/jobs/{id}` | Get job detail with questions |
| `PATCH` | `/api/jobs/{id}/status` | Open or close a job |
| `GET` | `/api/interviews/` | List candidates (filterable by job, status) |
| `GET` | `/api/interviews/{id}` | Get full candidate report |
| `PATCH` | `/api/interviews/{id}/status` | Update candidate status (shortlisted/rejected) |
| `GET` | `/api/interviews/{id}/report/pdf` | Download PDF report |
| `GET` | `/health` | Health check (no auth) |

---

## Database Schema

Three tables in Supabase PostgreSQL:

### `companies`
Stores company accounts. One row per registered company. Linked to Supabase Auth via `id` (same as `auth.users.id`).

### `jobs`
Each job posting owned by a company. Contains: title, department, location, employment type, job description, generated questions (JSONB), interview link token, status.

### `interviews`
One row per candidate interview. Contains: candidate name/email, full transcript (JSONB), AI assessment fields (score, breakdown, summary, strengths, concerns, recommendation), status, timestamps.

Row Level Security is enabled on all three tables. Each company can only read and write their own rows. Candidates can insert/update their own interview row using the interview session token.

See `supabase/schema.sql` for the full DDL.

---

## Data Flow

```
1. Company creates job → AI generates questions → interview link token issued
2. Candidate clicks link → welcome screen (name + email) → interview starts
3. Candidate answers questions → auto-saved every 10 seconds to Supabase
4. After each answer → AI optionally generates adaptive follow-up
5. Candidate submits → Groq scores the full transcript
6. Company sees ranked candidate list → clicks to view full report → optionally downloads PDF
```

---

## AI Behaviour

### Question Generation
Model: `gemini-2.0-flash`
Persona: Senior executive recruiter with 20 years experience + McKinsey analyst.
Input: Job title, department, description, question count, focus areas.
Output: JSON array of `{id, question, type, focus_area, what_it_reveals}`.

### Adaptive Follow-Up
Model: `gemini-2.0-flash`
Persona: Experienced interviewer who probes vague answers.
Input: Original question + candidate answer + remaining question count.
Output: Optional adaptive follow-up question string (or `null` to proceed).

### Candidate Scoring
Model: `gemini-2.0-flash`
Persona: Head of People at Fortune 500 + behavioral psychologist.
Input: Job description, focus areas, full interview transcript.
Output: `overall_score`, `score_breakdown`, `executive_summary`, `key_strengths`, `areas_of_concern`, `recommended_follow_up_questions`, `hiring_recommendation`.

All Gemini calls have a 45-second timeout and 1 automatic retry with a 3-second delay.

---

## Security Features

- **Supabase RLS** — database-level tenant isolation. Each company row is invisible to other companies.
- **Application-level ownership checks** — every company-facing endpoint calls `verify_company_owns_resource()` before returning data.
- **Cryptographic link tokens** — interview link tokens are UUID v4 (128 bits of entropy). Not guessable.
- **24-hour resume window** — in-progress interviews can be resumed within 24 hours using the same link token. After 24 hours, the session is considered abandoned.
- **Input sanitisation** — all user-supplied text is sanitised with `bleach` before storage.
- **Security headers** — every response includes: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`.
- **Rate limiting** — general: 100 req/min per IP. Interview endpoints: 30 req/min per IP.
- **No stack traces in production** — global error handler returns a safe error message and a request ID.

---

## Running Tests

```bash
cd backend
pytest tests/ -v
```

Tests cover:
- AI service: question generation, adaptive follow-up, scoring (mocked)
- Auth: signup, login, token verification
- Interview flow: start, save-answer, next-question, submit
- Candidate isolation: company A cannot access company B's data

---

## Deployment

### Backend — Render

1. Create a new **Web Service** on Render
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Set all environment variables from the reference above
5. Set `ENVIRONMENT=production`

### Frontend — Vercel

```bash
cd frontend
npx vercel --prod
```

Set environment variables in the Vercel dashboard:
- `NEXT_PUBLIC_API_URL` → your Render backend URL (e.g. `https://hireiq-api.onrender.com`)
- `NEXT_PUBLIC_SUPABASE_URL` → your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → your Supabase anon key

### Render cold start prevention

The frontend pings `GET /health` on the backend every 30 seconds (see `DashboardLayout`). This keeps the Render free-tier instance warm so candidates don't wait 30+ seconds for their first API call.

---

## Project Structure

```
backend/
├── main.py                    FastAPI app, middleware, routes
├── requirements.txt
└── app/
    ├── config.py              Settings via pydantic-settings
    ├── database.py            Supabase client (anon + service role)
    ├── auth.py                JWT verification, get_current_company
    ├── models/
    │   ├── company.py         Pydantic request/response models
    │   ├── job.py
    │   └── interview.py
    ├── routers/
    │   ├── auth_router.py     /api/auth/signup, /api/auth/login
    │   ├── companies_router.py /api/companies/me
    │   ├── jobs_router.py     /api/jobs/
    │   └── interviews_router.py /api/interviews/ + /api/interviews/public/
    └── services/
        ├── groq_service.py    Question generation, adaptive Q, scoring
        └── pdf_service.py     WeasyPrint PDF report generation

frontend/
├── app/
│   ├── layout.tsx             Root layout + AuthProvider
│   ├── page.tsx               Landing page
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx         Auth guard + DashboardNav + health ping
│   │   ├── dashboard/page.tsx Stats overview + recent activity
│   │   ├── jobs/
│   │   │   ├── page.tsx       Job list
│   │   │   ├── new/page.tsx   Create job wizard (3 steps)
│   │   │   └── [id]/page.tsx  Job detail + candidates
│   │   ├── candidates/
│   │   │   ├── page.tsx       All candidates (filterable)
│   │   │   └── [id]/page.tsx  Full candidate report
│   │   └── settings/page.tsx  Company settings
│   ├── interview/[token]/page.tsx  Candidate interview flow
│   ├── privacy/page.tsx       Privacy Policy
│   └── terms/page.tsx         Terms of Service
├── components/
│   ├── ui/Button.tsx
│   ├── ui/Input.tsx
│   ├── ui/ScoreBadge.tsx
│   └── layout/DashboardNav.tsx
└── lib/
    ├── api.ts                 All API calls, auth helpers
    ├── auth-context.tsx       AuthProvider + useAuth hook
    └── types.ts               Shared TypeScript types

supabase/
└── schema.sql                 DDL + indexes + RLS policies
```

---

## Licence

MIT. See `LICENSE` for details.
