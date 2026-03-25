import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRouter } from './router';

export const aiIncidentPlugin = createBackendPlugin({
  pluginId: 'ai-incident',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        config: coreServices.rootConfig,
        catalog: catalogServiceRef,
        auth: coreServices.auth,
      },
      async init({ logger, httpRouter, config, catalog, auth }) {
        const aiServiceUrl = config.getString('forge.aiServiceUrl');

        const router = await createRouter({
          logger, catalog, auth, aiServiceUrl,
        });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({
          path: '/webhook/alert',
          allow: 'unauthenticated',
        });
        logger.info('AI Incident Response plugin initialized');
      },
    });
  },
});
