#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { validateAirgapComposeConfig } from './verify-airgap.mjs';

const execFileAsync = promisify(execFile);

export function validateDeploymentComposeConfig(config, { profile = 'online' } = {}) {
  const errors = [];
  const services = config?.services || {};
  for (const name of ['frontend', 'backend', 'engine', 'executor-view', 'db']) {
    if (!services[name]) errors.push(`Required service ${name} is missing.`);
  }
  if (profile === 'airgap') errors.push(...validateAirgapComposeConfig(config));
  if (profile === 'online' && services.engine?.environment?.OPEN_KRITT_DEPLOYMENT_MODE === 'airgap') {
    errors.push('Online deployment cannot force the engine into air-gap mode.');
  }
  if (!services.db?.healthcheck) errors.push('Database healthcheck is required.');
  if (!services['executor-view']?.healthcheck) errors.push('Executor-view healthcheck is required.');
  return errors;
}

export async function verifyDeploymentCompose({
  rootDir = process.cwd(),
  profile = 'online',
  execute = execFileAsync,
} = {}) {
  const files = ['-f', 'docker-compose.yml'];
  if (profile === 'airgap') files.push('-f', 'docker-compose.airgap.yml');
  const { stdout } = await execute('docker', ['compose', ...files, 'config', '--format', 'json'], { cwd: rootDir });
  const errors = validateDeploymentComposeConfig(JSON.parse(stdout), { profile });
  if (errors.length) throw new Error(`Deployment verification failed:\n- ${errors.join('\n- ')}`);
  return `${profile} deployment configuration verified.\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const profile = process.argv[2] || 'online';
  if (!['online', 'airgap'].includes(profile)) {
    process.stderr.write('Usage: node scripts/verify-deployment.mjs [online|airgap]\n');
    process.exitCode = 1;
  } else {
    try {
      process.stdout.write(await verifyDeploymentCompose({ profile }));
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
