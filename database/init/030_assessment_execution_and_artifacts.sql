-- Durable control-plane records for reviewed assessment execution and reports.
-- These records are audit-only until separately reviewed, lab-tested adapters exist.

CREATE TABLE IF NOT EXISTS public.assessment_execution_jobs (
    id bigserial PRIMARY KEY,
    assessment_run_id bigint NOT NULL REFERENCES public.assessment_runs(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'blocked', 'cancelled', 'completed', 'failed')),
    cancellation_requested boolean NOT NULL DEFAULT false,
    operations_accounted integer NOT NULL DEFAULT 0 CHECK (operations_accounted >= 0),
    policy_receipt jsonb,
    inserted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_execution_jobs_run_id_idx
    ON public.assessment_execution_jobs(assessment_run_id, inserted_at DESC);

CREATE TABLE IF NOT EXISTS public.assessment_execution_events (
    id bigserial PRIMARY KEY,
    assessment_execution_job_id bigint NOT NULL REFERENCES public.assessment_execution_jobs(id) ON DELETE RESTRICT,
    event_type text NOT NULL,
    actor text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_execution_events_job_id_idx
    ON public.assessment_execution_events(assessment_execution_job_id, inserted_at DESC);

CREATE TABLE IF NOT EXISTS public.assessment_report_artifacts (
    id bigserial PRIMARY KEY,
    assessment_run_id bigint NOT NULL REFERENCES public.assessment_runs(id) ON DELETE RESTRICT,
    format text NOT NULL CHECK (format IN ('pdf', 'docx', 'xlsx')),
    digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    byte_length integer NOT NULL CHECK (byte_length >= 0),
    created_by text NOT NULL DEFAULT 'system',
    inserted_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (assessment_run_id, format, digest)
);

CREATE INDEX IF NOT EXISTS assessment_report_artifacts_run_id_idx
    ON public.assessment_report_artifacts(assessment_run_id, inserted_at DESC);