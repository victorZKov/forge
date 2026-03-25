import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { Octokit } from '@octokit/rest';
import { enrichEntity } from './enrich';

export const catalogEnricherModule = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'enricher',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        scheduler: coreServices.scheduler,
        catalog: catalogServiceRef,
        auth: coreServices.auth,
      },
      async init({ logger, config, scheduler, catalog, auth }) {
        const githubToken = config.getString('catalogEnricher.githubToken');
        const aiServiceUrl = config.getString('catalogEnricher.aiServiceUrl');
        const octokit = new Octokit({ auth: githubToken });

        await scheduler.scheduleTask({
          id: 'catalog-enricher-run',
          frequency: { minutes: 1440 },
          timeout: { minutes: 30 },
          initialDelay: { seconds: 30 },
          fn: async () => {
            logger.info('Starting catalog enrichment run');
            const { token } = await auth.getPluginRequestToken({
              onBehalfOf: await auth.getOwnServiceCredentials(),
              targetPluginId: 'catalog',
            });
            const { items: entities } = await catalog.getEntities(
              { filter: { kind: 'Component' } },
              { credentials: await auth.authenticate(token) },
            );

            let enriched = 0,
              skipped = 0,
              failed = 0;

            for (const entity of entities) {
              try {
                const changed = await enrichEntity({
                  entity,
                  octokit,
                  aiServiceUrl,
                  logger,
                });
                changed ? enriched++ : skipped++;
              } catch (error) {
                failed++;
                logger.error(
                  `Failed to enrich ${entity.metadata.name}: ${error}`,
                );
              }
            }

            logger.info(
              `Enrichment complete: ${enriched} enriched, ${skipped} skipped, ${failed} failed`,
            );
          },
        });
      },
    });
  },
});
