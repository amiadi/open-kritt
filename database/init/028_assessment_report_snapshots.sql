-- Immutable, local report inputs. Renderers consume these snapshots so a later
-- scope, authorization, or action edit cannot alter an issued report.

CREATE TABLE IF NOT EXISTS public.assessment_report_snapshots (
    id bigserial PRIMARY KEY,
    assessment_run_id bigint NOT NULL UNIQUE REFERENCES public.assessment_runs(id) ON DELETE RESTRICT,
    schema_version integer NOT NULL DEFAULT 1,
    snapshot jsonb NOT NULL,
    inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_report_snapshots_run_id_idx
    ON public.assessment_report_snapshots(assessment_run_id);