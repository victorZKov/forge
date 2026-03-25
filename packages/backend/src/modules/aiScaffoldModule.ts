import { createBackendModule } from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { coreServices } from '@backstage/backend-plugin-api';
import { createAiScaffoldAction } from '@internal/plugin-ai-scaffolder';

export const aiScaffoldModule = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'ai-scaffold',
  register(reg) {
    reg.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
      },
      async init({ scaffolder, config }) {
        const aiServiceUrl = config.getString('forge.aiServiceUrl');
        scaffolder.addActions(createAiScaffoldAction(aiServiceUrl));
      },
    });
  },
});
