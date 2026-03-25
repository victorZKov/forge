import {
  createPlugin,
  createComponentExtension,
} from '@backstage/core-plugin-api';

export const techdocsRagWidgetPlugin = createPlugin({
  id: 'techdocs-rag-widget',
});

export const AskAiCard = techdocsRagWidgetPlugin.provide(
  createComponentExtension({
    name: 'AskAiCard',
    component: {
      lazy: () =>
        import('./components/AskWidget').then(m => m.AskWidget),
    },
  }),
);
