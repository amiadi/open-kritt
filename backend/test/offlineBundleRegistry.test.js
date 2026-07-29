import assert from 'node:assert/strict';
import test from 'node:test';

import { validateOfflineBundleImport, ValidationError } from '../src/lib/validation.js';

const manifest = {
  schemaVersion: 1,
  createdAt: '2026-07-29T00:00:00.000Z',
  images: ['open-kritt-engine:local'],
  artifacts: [{ name: 'images.tar', sha256: 'a'.repeat(64), size: 1 }],
};

test('offline bundle imports retain only verified manifest metadata', () => {
  const result = validateOfflineBundleImport({
    manifest_digest: 'b'.repeat(64),
    manifest,
    actor: 'air-gap operator',
    verification_mode: 'signed',
  });

  assert.equal(result.manifestDigest, 'b'.repeat(64));
  assert.equal(result.verificationMode, 'signed');
  assert.equal(result.manifest.images[0], 'open-kritt-engine:local');
});

test('offline bundle import validation rejects invalid digest or manifest', () => {
  assert.throws(
    () => validateOfflineBundleImport({ manifest_digest: 'bad', manifest: {}, actor: '', verification_mode: 'other' }),
    (error) => error instanceof ValidationError && error.errors.length >= 3
  );
});
