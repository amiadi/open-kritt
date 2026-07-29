import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAirgapComposeConfig } from './verify-airgap.mjs';

function airgapConfig() {
  return {
    networks: { 'airgap-internal': { internal: true } },
    services: {
      backend: {
        networks: { 'airgap-internal': null },
        environment: {
          OPEN_KRITT_DEPLOYMENT_MODE: 'airgap',
          OPEN_KRITT_CODEX_API_KEY_CONFIGURED: '',
          OPEN_KRITT_OPENAI_API_KEY_CONFIGURED: '',
          OPEN_KRITT_ANTHROPIC_API_KEY_CONFIGURED: '',
          OPEN_KRITT_OPENROUTER_API_KEY_CONFIGURED: '',
          OPEN_KRITT_CODEX_LOGIN_CONFIGURED: '',
        },
      },
      engine: {
        networks: { 'airgap-internal': null },
        environment: {
          OPEN_KRITT_DEPLOYMENT_MODE: 'airgap',
          ENGINE_CODEX_AUTO_UPDATE: 'false',
          ENGINE_MODEL_CATALOG_REFRESH_SECONDS: '0',
          CODEX_API_KEY: '',
          OPENAI_API_KEY: '',
          ANTHROPIC_API_KEY: '',
          OPENROUTER_API_KEY: '',
          GITHUB_TOKEN: '',
        },
      },
      db: { networks: { 'airgap-internal': null } },
    },
  };
}

test('air-gap Compose validation accepts an internal-only deployment', () => {
  assert.deepEqual(validateAirgapComposeConfig(airgapConfig()), []);
});

test('air-gap Compose validation rejects egress networks and unsafe engine settings', () => {
  const config = airgapConfig();
  config.services.engine.networks.egress = null;
  config.services.engine.environment.ENGINE_MODEL_CATALOG_REFRESH_SECONDS = '300';
  config.services.engine.environment.OPENAI_API_KEY = 'unexpected-secret';

  const errors = validateAirgapComposeConfig(config);
  assert.ok(errors.some((error) => /attached only/.test(error)));
  assert.ok(errors.some((error) => /model catalog refresh/.test(error)));
  assert.ok(errors.some((error) => /clear OPENAI_API_KEY/.test(error)));
});
