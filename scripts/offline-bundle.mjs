#!/usr/bin/env node

import { createHash, sign, verify } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const BUNDLE_SCHEMA_VERSION = 1;

export async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

export function stableManifestPayload(manifest) {
  const { signature, ...unsigned } = manifest;
  return `${JSON.stringify(unsigned, null, 2)}\n`;
}

export function manifestDigest(manifest) {
  return createHash('sha256').update(stableManifestPayload(manifest)).digest('hex');
}

export function parseImageList(value) {
  const images = String(value || '')
    .split(',')
    .map((image) => image.trim())
    .filter(Boolean);
  if (!images.length) throw new Error('At least one image is required. Use --images image:tag[,image:tag].');
  if (images.some((image) => image.startsWith('-') || /\s/.test(image))) {
    throw new Error('Image references must not start with a dash or contain whitespace.');
  }
  return [...new Set(images)];
}

export async function airgapComposeImages({ rootDir = process.cwd(), execute = execFileAsync } = {}) {
  const { stdout } = await execute(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.airgap.yml', 'config', '--images'],
    { cwd: rootDir }
  );
  return parseImageList(stdout.replaceAll('\n', ','));
}

export async function createBundleManifest({ archivePath, images, privateKeyPath = null }) {
  const archive = await stat(archivePath);
  const manifest = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    images: [...images],
    artifacts: [{ name: 'images.tar', sha256: await sha256File(archivePath), size: archive.size }],
  };
  if (privateKeyPath) {
    const privateKey = await readFile(privateKeyPath);
    manifest.signature = {
      algorithm: 'ed25519',
      value: sign(null, Buffer.from(stableManifestPayload(manifest)), privateKey).toString('base64'),
    };
  }
  return manifest;
}

export async function verifyBundle({ directory, publicKeyPath = null, requireSignature = false }) {
  const manifestPath = resolve(directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== BUNDLE_SCHEMA_VERSION) throw new Error('Unsupported offline bundle manifest version.');
  if (!Array.isArray(manifest.artifacts) || !manifest.artifacts.length)
    throw new Error('Bundle manifest has no artifacts.');
  for (const artifact of manifest.artifacts) {
    if (!artifact?.name || !/^[A-Za-z0-9._-]+$/.test(artifact.name))
      throw new Error('Bundle manifest has an unsafe artifact name.');
    const artifactPath = resolve(directory, artifact.name);
    if (dirname(artifactPath) !== resolve(directory))
      throw new Error('Bundle artifact must remain inside the bundle directory.');
    const file = await stat(artifactPath);
    if (file.size !== artifact.size) throw new Error(`Bundle artifact size mismatch: ${artifact.name}`);
    if ((await sha256File(artifactPath)) !== artifact.sha256)
      throw new Error(`Bundle artifact digest mismatch: ${artifact.name}`);
  }
  if (requireSignature && !manifest.signature) throw new Error('This deployment requires a signed offline bundle.');
  if (manifest.signature) {
    if (manifest.signature.algorithm !== 'ed25519') throw new Error('Unsupported bundle signature algorithm.');
    if (!publicKeyPath) throw new Error('A public key is required to verify this signed offline bundle.');
    const publicKey = await readFile(publicKeyPath);
    const valid = verify(
      null,
      Buffer.from(stableManifestPayload(manifest)),
      publicKey,
      Buffer.from(manifest.signature.value, 'base64')
    );
    if (!valid) throw new Error('Offline bundle signature verification failed.');
  }
  return manifest;
}

async function runDocker(args) {
  await execFileAsync('docker', args, { stdio: 'inherit' });
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function usage() {
  return `Offline bundle utility

Usage:
  node scripts/offline-bundle.mjs export --output ./bundle --images image:tag[,image:tag] [--private-key key.pem]
  node scripts/offline-bundle.mjs export --output ./bundle --compose-airgap [--private-key key.pem]
  node scripts/offline-bundle.mjs import --input ./bundle [--public-key key.pub.pem] [--require-signature] [--verify-only] [--register-url URL --actor NAME]

The export command saves Docker images as images.tar and writes manifest.json with SHA-256 digests.
Use --compose-airgap to include every image from the resolved air-gap Compose profile.
An Ed25519 private key signs the manifest when --private-key is supplied. Import always verifies digests before docker image load.`;
}

async function registerImport({ url, actor, manifest, fetchImpl }) {
  if (!url) return;
  if (!actor?.trim()) throw new Error('Import registration requires --actor.');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      manifest_digest: manifestDigest(manifest),
      manifest,
      actor: actor.trim(),
      verification_mode: manifest.signature ? 'signed' : 'digest',
    }),
  });
  if (!response.ok) throw new Error(`Offline bundle import registration failed (${response.status}).`);
}

export async function runOfflineBundleCli(
  argv,
  {
    docker = runDocker,
    composeImages = airgapComposeImages,
    fetchImpl = fetch,
    output = process.stdout,
    rootDir = process.cwd(),
  } = {}
) {
  const [command, ...args] = argv;
  if (!command || command === 'help' || command === '--help') {
    output.write(`${usage()}\n`);
    return 0;
  }
  if (command === 'export') {
    const outputDir = option(args, '--output');
    if (!outputDir) throw new Error('The export command requires --output.');
    const imageList = option(args, '--images');
    const useAirgapCompose = args.includes('--compose-airgap');
    if (Boolean(imageList) === useAirgapCompose) {
      throw new Error('The export command requires exactly one of --images or --compose-airgap.');
    }
    const images = useAirgapCompose ? await composeImages({ rootDir }) : parseImageList(imageList);
    const directory = resolve(outputDir);
    await mkdir(directory, { recursive: true });
    const archivePath = resolve(directory, 'images.tar');
    await docker(['image', 'save', '--output', archivePath, ...images]);
    const manifest = await createBundleManifest({ archivePath, images, privateKeyPath: option(args, '--private-key') });
    await writeFile(resolve(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    output.write(`Created offline bundle at ${directory}\n`);
    return 0;
  }
  if (command === 'import') {
    const inputDir = option(args, '--input');
    if (!inputDir) throw new Error('The import command requires --input.');
    const directory = resolve(inputDir);
    const manifest = await verifyBundle({
      directory,
      publicKeyPath: option(args, '--public-key'),
      requireSignature: args.includes('--require-signature'),
    });
    if (option(args, '--register-url') && !option(args, '--actor')?.trim()) {
      throw new Error('Import registration requires --actor.');
    }
    if (!args.includes('--verify-only')) await docker(['image', 'load', '--input', resolve(directory, 'images.tar')]);
    await registerImport({
      url: option(args, '--register-url'),
      actor: option(args, '--actor'),
      manifest,
      fetchImpl,
    });
    output.write(
      `${args.includes('--verify-only') ? 'Verified' : 'Imported'} offline bundle with ${manifest.images.length} image(s).\n`
    );
    return 0;
  }
  throw new Error(`Unknown offline bundle command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runOfflineBundleCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
