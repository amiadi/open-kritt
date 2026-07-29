import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createBundleManifest,
  manifestDigest,
  parseImageList,
  runOfflineBundleCli,
  verifyBundle,
} from './offline-bundle.mjs';

test('offline bundle manifest verifies digests and an Ed25519 signature', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'open-kritt-bundle-'));
  const archivePath = join(directory, 'images.tar');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyPath = join(directory, 'signing-key.pem');
  const publicKeyPath = join(directory, 'signing-key.pub.pem');
  await writeFile(archivePath, 'offline image archive');
  await writeFile(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await writeFile(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
  const manifest = await createBundleManifest({ archivePath, images: ['open-kritt-engine:local'], privateKeyPath });
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  t.after(async () => {
    await writeFile(archivePath, '');
  });

  const verified = await verifyBundle({ directory, publicKeyPath, requireSignature: true });
  assert.deepEqual(verified.images, ['open-kritt-engine:local']);
  await writeFile(archivePath, 'tampered');
  await assert.rejects(verifyBundle({ directory, publicKeyPath, requireSignature: true }), /(size|digest) mismatch/);
});

test('offline bundle image lists are normalized and require an image', () => {
  assert.deepEqual(parseImageList(' engine:1,engine:1, db:1 '), ['engine:1', 'db:1']);
  assert.throws(() => parseImageList(''), /At least one image/);
  assert.throws(() => parseImageList('--output,engine:1'), /must not start with a dash/);
});

test('offline bundle export can use the resolved air-gap Compose image list', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'open-kritt-bundle-export-'));
  t.after(() => writeFile(join(directory, 'images.tar'), ''));
  const calls = [];
  const output = {
    text: '',
    write(value) {
      this.text += value;
    },
  };

  await runOfflineBundleCli(['export', '--output', directory, '--compose-airgap'], {
    docker: async (args) => {
      calls.push(args);
      await writeFile(args[args.indexOf('--output') + 1], 'archive');
    },
    composeImages: async () => ['open-kritt-engine:local', 'postgres:16'],
    output,
  });

  assert.deepEqual(calls, [
    ['image', 'save', '--output', join(directory, 'images.tar'), 'open-kritt-engine:local', 'postgres:16'],
  ]);
  assert.match(output.text, /Created offline bundle/);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.images, ['open-kritt-engine:local', 'postgres:16']);
});

test('verified imports can register an immutable manifest audit record', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'open-kritt-bundle-import-'));
  const archivePath = join(directory, 'images.tar');
  await writeFile(archivePath, 'archive');
  const manifest = await createBundleManifest({ archivePath, images: ['engine:1'] });
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  t.after(() => writeFile(archivePath, ''));
  let request;

  await runOfflineBundleCli(
    ['import', '--input', directory, '--verify-only', '--register-url', 'http://audit/imports', '--actor', 'operator'],
    {
      fetchImpl: async (url, options) => {
        request = { url, body: JSON.parse(options.body) };
        return { ok: true, status: 201 };
      },
      output: { write() {} },
    }
  );

  assert.equal(request.url, 'http://audit/imports');
  assert.equal(request.body.manifest_digest, manifestDigest(manifest));
  assert.equal(request.body.actor, 'operator');
  assert.equal(request.body.verification_mode, 'digest');
});
