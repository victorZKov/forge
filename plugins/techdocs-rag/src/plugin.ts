import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { indexEntityDocs } from './indexer';

export const techDocsRagPlugin = createBackendPlugin({
  pluginId: 'techdocs-rag',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
        config: coreServices.rootConfig,
        catalog: catalogServiceRef,
        auth: coreServices.auth,
      },
      async init({ logger, scheduler, config, catalog, auth }) {
        const aiServiceUrl = config.getString('forge.aiServiceUrl');

        await scheduler.scheduleTask({
          id: 'techdocs-rag-indexer',
          frequency: { hours: 6 },
          timeout: { minutes: 30 },
          initialDelay: { seconds: 60 },
          fn: async () => {
            logger.info('Starting TechDocs indexing');

            const credentials = await auth.getOwnServiceCredentials();
            const { items: entities } = await catalog.getEntities(
              { filter: { kind: 'Component' } },
              { credentials },
            );

            let indexed = 0;
            let skipped = 0;
            let failed = 0;

            for (const entity of entities) {
              try {
                const count = await indexEntityDocs({
                  entity,
                  aiServiceUrl,
                  logger,
                });
                if (count > 0) {
                  indexed++;
                } else {
                  skipped++;
                }
              } catch (err) {
                failed++;
                logger.error(
                  `Failed to index docs for ${entity.metadata.name}: ${err}`,
                );
              }
            }

            logger.info(
              `TechDocs indexing complete: ${indexed} indexed, ${skipped} skipped, ${failed} failed`,
            );
          },
        });
      },
    });
  },
});
