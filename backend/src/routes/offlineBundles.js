import { Router } from 'express';

import { prisma } from '../db.js';
import { validateOfflineBundleImport } from '../lib/validation.js';

const router = Router();

function serializeBundle(bundle) {
  return {
    ...bundle,
    imports: bundle.imports?.map((entry) => ({ ...entry, id: entry.id.toString() })),
  };
}

router.get('/', async (req, res, next) => {
  try {
    const bundles = await prisma.offlineBundle.findMany({
      include: { imports: { orderBy: { importedAt: 'desc' }, take: 20 } },
      orderBy: { insertedAt: 'desc' },
    });
    res.json(bundles.map(serializeBundle));
  } catch (error) {
    next(error);
  }
});

router.post('/imports', async (req, res, next) => {
  try {
    const { manifestDigest, actor, verificationMode, manifest } = validateOfflineBundleImport(req.body);
    const bundle = await prisma.$transaction(async (tx) => {
      await tx.offlineBundle.upsert({
        where: { manifestDigest },
        create: {
          manifestDigest,
          schemaVersion: manifest.schemaVersion,
          createdAt: new Date(manifest.createdAt),
          images: manifest.images,
          artifacts: manifest.artifacts,
          signatureAlgorithm: manifest.signature?.algorithm || null,
        },
        update: {},
      });
      await tx.offlineBundleImport.create({ data: { manifestDigest, actor, verificationMode } });
      return tx.offlineBundle.findUnique({
        where: { manifestDigest },
        include: { imports: { orderBy: { importedAt: 'desc' }, take: 20 } },
      });
    });
    res.status(201).json(serializeBundle(bundle));
  } catch (error) {
    next(error);
  }
});

export default router;
