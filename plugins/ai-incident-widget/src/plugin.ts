import { createPlugin, createComponentExtension } from '@backstage/core-plugin-api';

export const aiIncidentWidgetPlugin = createPlugin({
  id: 'ai-incident-widget',
});

export const IncidentCard = aiIncidentWidgetPlugin.provide(
  createComponentExtension({
    name: 'IncidentCard',
    component: {
      lazy: () =>
        import('./components/IncidentCard').then(m => m.IncidentCard),
    },
  }),
);
