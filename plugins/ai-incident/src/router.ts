import { Router, json } from 'express';
import type { LoggerService, AuthService } from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { gatherIncidentContext } from './gather';

interface RouterOptions {
  logger: LoggerService;
  catalog: CatalogService;
  auth: AuthService;
  aiServiceUrl: string;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { logger, catalog, auth, aiServiceUrl } = options;
  const router = Router();
  router.use(json());

  router.post('/webhook/alert', async (req, res) => {
    const { serviceName, alertTitle, severity, startedAt, errors } =
      req.body;

    logger.info(`Alert received: ${alertTitle} for ${serviceName}`);

    const credentials = await auth.getOwnServiceCredentials();
    const entities = await catalog.getEntities(
      {
        filter: {
          kind: 'Component',
          'metadata.name': serviceName,
        },
      },
      { credentials },
    );

    if (entities.items.length === 0) {
      logger.info(`No catalog entity for ${serviceName}`);
      res.status(200).json({ skipped: 'not in catalog' });
      return;
    }

    const entity = entities.items[0];
    const context = await gatherIncidentContext(entity, logger);

    const aiRes = await fetch(`${aiServiceUrl}/api/incident/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...context,
        recentErrors: errors ?? context.recentErrors,
        alertTitle,
        severity,
        startedAt,
      }),
    });

    if (!aiRes.ok) {
      logger.error(`AI incident analysis failed: ${aiRes.status}`);
      res.status(500).json({ error: 'AI analysis failed' });
      return;
    }

    const analysis = await aiRes.json();
    logger.info(`Incident analysis complete for ${serviceName}`);
    res.status(200).json(analysis);
  });

  router.post('/analyze', async (req, res) => {
    const { entityRef, alertTitle, errors } = req.body;

    const name = entityRef.split('/').pop();
    const credentials = await auth.getOwnServiceCredentials();
    const entities = await catalog.getEntities(
      {
        filter: {
          kind: 'Component',
          'metadata.name': name,
        },
      },
      { credentials },
    );

    if (entities.items.length === 0) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const entity = entities.items[0];
    const context = await gatherIncidentContext(entity, logger);

    const aiRes = await fetch(`${aiServiceUrl}/api/incident/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...context,
        recentErrors: errors ?? context.recentErrors,
        alertTitle: alertTitle ?? 'Manual analysis',
        severity: 'unknown',
        startedAt: new Date().toISOString(),
      }),
    });

    const analysis = await aiRes.json();
    res.status(200).json(analysis);
  });

  return router;
}
