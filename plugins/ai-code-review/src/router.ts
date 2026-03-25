import { Router, json } from 'express';
import type { LoggerService, AuthService } from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { reviewPullRequest } from './review';

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

  router.post('/webhook/github', async (req, res) => {
    const event = req.headers['x-github-event'];
    const payload = req.body;

    if (event !== 'pull_request') {
      res.status(200).json({ ignored: true });
      return;
    }

    const action = payload.action;
    if (action !== 'opened' && action !== 'synchronize') {
      res.status(200).json({ ignored: true });
      return;
    }

    const repoFullName = payload.repository.full_name;
    const prNumber = payload.pull_request.number;
    const prTitle = payload.pull_request.title;

    logger.info(
      `PR ${action}: ${repoFullName}#${prNumber} — ${prTitle}`,
    );

    // Look up the service in the catalog
    const credentials = await auth.getOwnServiceCredentials();
    const entities = await catalog.getEntities(
      {
        filter: {
          kind: 'Component',
          'metadata.annotations.github.com/project-slug': repoFullName,
        },
      },
      { credentials },
    );

    if (entities.items.length === 0) {
      logger.info(
        `No catalog entity for ${repoFullName}, skipping review`,
      );
      res.status(200).json({ skipped: 'not in catalog' });
      return;
    }

    const entity = entities.items[0];

    // Run the review in the background
    reviewPullRequest({
      entity,
      repoFullName,
      prNumber,
      prTitle,
      aiServiceUrl,
      logger,
    }).catch(err =>
      logger.error(`Review failed for ${repoFullName}#${prNumber}: ${err}`),
    );

    res.status(202).json({ accepted: true });
  });

  return router;
}
