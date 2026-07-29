#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const AIRGAP_NETWORK = 'airgap-internal';

export function validateAirgapComposeConfig(config) {
  const errors = [];
  if (config?.networks?.[AIRGAP_NETWORK]?.internal !== true) {
    errors.push(`The ${AIRGAP_NETWORK} network must be marked internal.`);
  }

  const services = config?.services;
  if (!services || typeof services !== 'object' || !Object.keys(services).length) {
    errors.push('The resolved Compose configuration has no services.');
  } else {
    for (const [name, service] of Object.entries(services)) {
      const networks = Object.keys(service?.networks || {});
      if (networks.length !== 1 || networks[0] !== AIRGAP_NETWORK) {
        errors.push(`Service ${name} must be attached only to ${AIRGAP_NETWORK}.`);
      }
    }
  }

  for (const serviceName of ['backend', 'engine']) {
    const environment = services?.[serviceName]?.environment || {};
    if (environment.OPEN_KRITT_DEPLOYMENT_MODE !== 'airgap') {
      errors.push(`Service ${serviceName} must enforce OPEN_KRITT_DEPLOYMENT_MODE=airgap.`);
    }
  }
  if (services?.engine?.environment?.ENGINE_CODEX_AUTO_UPDATE !== 'false') {
    errors.push('The engine must disable Codex auto-updates in air-gap mode.');
  }
  if (services?.engine?.environment?.ENGINE_MODEL_CATALOG_REFRESH_SECONDS !== '0') {
    errors.push('The engine must disable model catalog refresh in air-gap mode.');
  }
  for (const key of ['CODEX_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GITHUB_TOKEN']) {
    if (services?.engine?.environment?.[key] !== '') {
      errors.push(`The engine must clear ${key} in air-gap mode.`);
    }
  }
  for (const key of [
    'OPEN_KRITT_CODEX_API_KEY_CONFIGURED',
    'OPEN_KRITT_OPENAI_API_KEY_CONFIGURED',
    'OPEN_KRITT_ANTHROPIC_API_KEY_CONFIGURED',
    'OPEN_KRITT_OPENROUTER_API_KEY_CONFIGURED',
    'OPEN_KRITT_CODEX_LOGIN_CONFIGURED',
  ]) {
    if (services?.backend?.environment?.[key] !== '') {
      errors.push(`The backend must clear ${key} in air-gap mode.`);
    }
  }
  return errors;
}

export async function verifyAirgapCompose({ rootDir = process.cwd(), execute = execFileAsync } = {}) {
  const { stdout } = await execute(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.airgap.yml', 'config', '--format', 'json'],
    { cwd: rootDir }
  );
  const errors = validateAirgapComposeConfig(JSON.parse(stdout));
  if (errors.length) throw new Error(`Air-gap deployment verification failed:\n- ${errors.join('\n- ')}`);
  return 'Air-gap deployment verified: every service is isolated on the internal airgap-internal network.\n';
}

export async function runAirgapVerifyCli(argv, { rootDir = process.cwd(), output = process.stdout } = {}) {
  if (argv.length && !argv.every((value) => value === 'verify' || value === '--help' || value === '-h')) {
    throw new Error('Usage: ./kritt airgap verify');
  }
  output.write(await verifyAirgapCompose({ rootDir }));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runAirgapVerifyCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
