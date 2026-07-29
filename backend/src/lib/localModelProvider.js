const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const LOCAL_MODEL_PROVIDERS = new Set(['openai_compatible', 'ollama']);
const PROBE_TIMEOUT_MS = 3_000;

function configuredProvider(env) {
  const value =
    typeof env.OPEN_KRITT_LOCAL_MODEL_PROVIDER === 'string'
      ? env.OPEN_KRITT_LOCAL_MODEL_PROVIDER.trim().toLowerCase()
      : '';
  return value || 'openai_compatible';
}

export function localModelProviderStatus(env = process.env) {
  const provider = configuredProvider(env);
  const configuredEndpoint =
    typeof env.OPEN_KRITT_LOCAL_MODEL_ENDPOINT === 'string' ? env.OPEN_KRITT_LOCAL_MODEL_ENDPOINT.trim() : '';
  const model = typeof env.OPEN_KRITT_LOCAL_MODEL_ID === 'string' ? env.OPEN_KRITT_LOCAL_MODEL_ID.trim() : '';
  if (!LOCAL_MODEL_PROVIDERS.has(provider)) {
    return { configured: false, reason: 'OPEN_KRITT_LOCAL_MODEL_PROVIDER must be openai_compatible or ollama.' };
  }
  const endpoint = configuredEndpoint || (provider === 'ollama' ? 'http://ollama:11434' : '');
  if (!endpoint || !model) {
    return {
      configured: false,
      reason: 'Set OPEN_KRITT_LOCAL_MODEL_ENDPOINT and OPEN_KRITT_LOCAL_MODEL_ID for an internal provider.',
    };
  }
  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || LOCAL_HOSTS.has(url.hostname)) {
      return { configured: false, reason: 'Use an internal service hostname, not localhost or a local loopback URL.' };
    }
    return {
      configured: true,
      provider,
      endpoint: url.toString(),
      model,
      api: provider === 'ollama' ? 'ollama' : 'openai_compatible',
    };
  } catch {
    return { configured: false, reason: 'OPEN_KRITT_LOCAL_MODEL_ENDPOINT must be an HTTP(S) URL.' };
  }
}

function probeUrl(status) {
  const endpoint = new URL(status.endpoint);
  if (status.provider === 'ollama') return new URL('/api/tags', endpoint).toString();
  return new URL('models', endpoint.pathname.endsWith('/') ? endpoint : `${endpoint}/`).toString();
}

function modelIds(status, payload) {
  if (status.provider === 'ollama') {
    return Array.isArray(payload?.models) ? payload.models.map((entry) => entry?.name).filter(Boolean) : [];
  }
  return Array.isArray(payload?.data) ? payload.data.map((entry) => entry?.id).filter(Boolean) : [];
}

export async function probeLocalModelProvider(
  env = process.env,
  { fetchImpl = fetch, timeoutMs = PROBE_TIMEOUT_MS } = {}
) {
  const status = localModelProviderStatus(env);
  if (!status.configured) return status;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(probeUrl(status), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return { ...status, reachable: false, reason: `Provider returned HTTP ${response.status}.` };
    const availableModels = modelIds(status, await response.json());
    return {
      ...status,
      reachable: true,
      modelAvailable: availableModels.includes(status.model),
      availableModelCount: availableModels.length,
    };
  } catch {
    return { ...status, reachable: false, reason: 'Could not reach the internal local model provider.' };
  } finally {
    clearTimeout(timer);
  }
}
