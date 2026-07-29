import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createApp } from '../src/app.js';
import { localModelProviderStatus, probeLocalModelProvider } from '../src/lib/localModelProvider.js';

test('local model status accepts an internal OpenAI-compatible service URL', () => {
  assert.deepEqual(
    localModelProviderStatus({
      OPEN_KRITT_LOCAL_MODEL_ENDPOINT: 'http://local-llm:8000/v1',
      OPEN_KRITT_LOCAL_MODEL_ID: 'qwen-local',
    }),
    {
      configured: true,
      provider: 'openai_compatible',
      endpoint: 'http://local-llm:8000/v1',
      model: 'qwen-local',
      api: 'openai_compatible',
    }
  );
});

test('local model status supports an existing Ollama container on the internal network', () => {
  assert.deepEqual(
    localModelProviderStatus({ OPEN_KRITT_LOCAL_MODEL_PROVIDER: 'ollama', OPEN_KRITT_LOCAL_MODEL_ID: 'qwen2.5:7b' }),
    {
      configured: true,
      provider: 'ollama',
      endpoint: 'http://ollama:11434/',
      model: 'qwen2.5:7b',
      api: 'ollama',
    }
  );
});

test('Ollama readiness probe verifies the configured model is installed', async () => {
  const status = await probeLocalModelProvider(
    { OPEN_KRITT_LOCAL_MODEL_PROVIDER: 'ollama', OPEN_KRITT_LOCAL_MODEL_ID: 'qwen2.5:7b' },
    {
      fetchImpl: async (url) => {
        assert.equal(url, 'http://ollama:11434/api/tags');
        return { ok: true, json: async () => ({ models: [{ name: 'qwen2.5:7b' }, { name: 'other:latest' }] }) };
      },
    }
  );
  assert.deepEqual(status, {
    configured: true,
    provider: 'ollama',
    endpoint: 'http://ollama:11434/',
    model: 'qwen2.5:7b',
    api: 'ollama',
    reachable: true,
    modelAvailable: true,
    availableModelCount: 2,
  });
});

test('local provider readiness probe does not expose connection failures', async () => {
  const status = await probeLocalModelProvider(
    { OPEN_KRITT_LOCAL_MODEL_PROVIDER: 'ollama', OPEN_KRITT_LOCAL_MODEL_ID: 'missing' },
    {
      fetchImpl: async () => {
        throw new Error('unreachable');
      },
    }
  );
  assert.equal(status.reachable, false);
  assert.equal(status.reason, 'Could not reach the internal local model provider.');
});

test('local model status rejects loopback and incomplete configuration', () => {
  assert.equal(localModelProviderStatus({}).configured, false);
  assert.equal(
    localModelProviderStatus({
      OPEN_KRITT_LOCAL_MODEL_ENDPOINT: 'http://localhost:8000/v1',
      OPEN_KRITT_LOCAL_MODEL_ID: 'x',
    }).configured,
    false
  );
});

test('air-gap status exposes configuration state without secrets', async () => {
  const server = createApp({
    env: {
      OPEN_KRITT_DEPLOYMENT_MODE: 'airgap',
      OPEN_KRITT_LOCAL_MODEL_PROVIDER: 'openai_compatible',
      OPEN_KRITT_LOCAL_MODEL_ENDPOINT: 'http://local-llm:8000/v1',
      OPEN_KRITT_LOCAL_MODEL_ID: 'qwen-local',
    },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/airgap/status`);
    assert.deepEqual(await response.json(), {
      mode: 'airgap',
      localModelProvider: {
        configured: true,
        provider: 'openai_compatible',
        endpoint: 'http://local-llm:8000/v1',
        model: 'qwen-local',
        api: 'openai_compatible',
      },
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
