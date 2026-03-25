import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRouter } from './router';

export const aiCodeReviewPlugin = createBackendPlugin({
  pluginId: 'ai-code-review',
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
          logger,
          catalog,
          auth,
          aiServiceUrl,
        });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({
          path: '/webhook/github',
          allow: 'unauthenticated',
        });
        logger.info('AI Code Review plugin initialized');
      },
    });
  },
});
