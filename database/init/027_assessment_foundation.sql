-- Control-plane foundation for authorized, non-destructive assessments.
-- Execution adapters are added separately; these records establish immutable
-- scope and authorization snapshots before a run can be planned or executed.

CREATE TABLE IF NOT EXISTS public.deployment_profiles (
    id text PRIMARY KEY,
    mode text NOT NULL DEFAULT 'online' CHECK (mode IN ('online', 'airgap')),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.deployment_profiles (id, mode)
VALUES ('default', 'online')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.engagements (
    id bigserial PRIMARY KEY,
    name text NOT NULL,
    description text,
    owner text NOT NULL,
    classification text NOT NULL DEFAULT 'confidential',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
    inserted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.target_scopes (
    id bigserial PRIMARY KEY,
    engagement_id bigint NOT NULL REFERENCES public.engagements(id) ON DELETE RESTRICT,
    name text NOT NULL,
    targets jsonb NOT NULL DEFAULT '[]'::jsonb,
    exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
    inserted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(targets) = 'array'),
    CHECK (jsonb_typeof(exclusions) = 'array')
);

CREATE INDEX IF NOT EXISTS target_scopes_engagement_id_idx ON public.target_scopes(engagement_id);

CREATE TABLE IF NOT EXISTS public.authorization_records (
    id bigserial PRIMARY KEY,
    engagement_id bigint NOT NULL REFERENCES public.engagements(id) ON DELETE RESTRICT,
    approved_by text NOT NULL,
    authorization_reference text NOT NULL,
    valid_from timestamptz NOT NULL,
    valid_until timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'revoked', 'expired')),
    evidence_reference text,
    inserted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS authorization_records_engagement_id_idx ON public.authorization_records(engagement_id);

CREATE TABLE IF NOT EXISTS public.assessment_runs (
    id bigserial PRIMARY KEY,
    engagement_id bigint NOT NULL REFERENCES public.engagements(id) ON DELETE RESTRICT,
    target_scope_id bigint NOT NULL REFERENCES public.target_scopes(id) ON DELETE RESTRICT,
    authorization_record_id bigint NOT NULL REFERENCES public.authorization_records(id) ON DELETE RESTRICT,
    capability text NOT NULL CHECK (capability IN ('infrastructure', 'web_application', 'embedded')),
    execution_mode text NOT NULL CHECK (execution_mode IN ('autonomous', 'dry_run', 'semi_auto', 'guided')),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'awaiting_authorization', 'planning', 'awaiting_approval', 'running', 'awaiting_operator', 'collecting_evidence', 'reporting', 'completed', 'cancelled', 'blocked_by_policy', 'scope_violation', 'failed', 'timed_out')),
    deployment_mode text NOT NULL CHECK (deployment_mode IN ('online', 'airgap')),
    policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    scope_snapshot jsonb NOT NULL,
    authorization_snapshot jsonb NOT NULL,
    inserted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_runs_engagement_id_idx ON public.assessment_runs(engagement_id);
CREATE INDEX IF NOT EXISTS assessment_runs_status_inserted_at_idx ON public.assessment_runs(status, inserted_at DESC);

CREATE TABLE IF NOT EXISTS public.assessment_actions (
    id bigserial PRIMARY KEY,
    assessment_run_id bigint NOT NULL REFERENCES public.assessment_runs(id) ON DELETE RESTRICT,
    action_type text NOT NULL,
    risk_classification text NOT NULL CHECK (risk_classification IN ('passive', 'safe_active', 'intrusive', 'prohibited')),
    status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'approved', 'denied', 'executed', 'blocked')),
    summary text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    inserted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_actions_run_id_idx ON public.assessment_actions(assessment_run_id);

CREATE TABLE IF NOT EXISTS public.assessment_audit_events (
    id bigserial PRIMARY KEY,
    assessment_run_id bigint REFERENCES public.assessment_runs(id) ON DELETE RESTRICT,
    event_type text NOT NULL,
    actor text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_audit_events_run_id_inserted_at_idx
    ON public.assessment_audit_events(assessment_run_id, inserted_at DESC);