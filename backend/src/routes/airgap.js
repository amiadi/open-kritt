import { Router } from 'express';

import { localModelProviderStatus, probeLocalModelProvider } from '../lib/localModelProvider.js';

export function createAirgapRouter({ env = process.env } = {}) {
  const router = Router();

  router.get('/status', async (req, res, next) => {
    const mode = env.OPEN_KRITT_DEPLOYMENT_MODE?.trim().toLowerCase() || 'online';
    try {
      const probe = ['1', 'true', 'yes'].includes(String(req.query.probe || '').toLowerCase());
      res.json({
        mode,
        localModelProvider: probe ? await probeLocalModelProvider(env) : localModelProviderStatus(env),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createAirgapRouter();
