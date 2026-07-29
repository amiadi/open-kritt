-- Immutable inventory and import audit trail for offline transport bundles.
-- Records contain manifest metadata only; archives and keys are never stored in
-- the database.

CREATE TABLE IF NOT EXISTS public.offline_bundles (
    manifest_digest text PRIMARY KEY,
    schema_version integer NOT NULL,
    created_at timestamptz NOT NULL,
    images jsonb NOT NULL,
    artifacts jsonb NOT NULL,
    signature_algorithm text,
    inserted_at timestamptz NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(images) = 'array'),
    CHECK (jsonb_typeof(artifacts) = 'array')
);

CREATE TABLE IF NOT EXISTS public.offline_bundle_imports (
    id bigserial PRIMARY KEY,
    manifest_digest text NOT NULL REFERENCES public.offline_bundles(manifest_digest) ON DELETE RESTRICT,
    actor text NOT NULL,
    verification_mode text NOT NULL CHECK (verification_mode IN ('digest', 'signed')),
    imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offline_bundle_imports_manifest_digest_imported_at_idx
    ON public.offline_bundle_imports(manifest_digest, imported_at DESC);