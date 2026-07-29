import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDeploymentComposeConfig } from './verify-deployment.mjs';

const base = {
  services: {
    frontend: {},
    backend: {},
    engine: { environment: {} },
    'executor-view': { healthcheck: { test: ['CMD', 'true'] } },
    db: { healthcheck: { test: ['CMD', 'true'] } },
  },
};

test('deployment validator accepts a complete online topology', () => {
  assert.deepEqual(validateDeploymentComposeConfig(base), []);
});

test('deployment validator rejects missing required services and health checks', () => {
  const invalid = { services: { ...base.services, db: {} } };
  delete invalid.services.frontend;
  assert.deepEqual(validateDeploymentComposeConfig(invalid), [
    'Required service frontend is missing.',
    'Database healthcheck is required.',
  ]);
});
