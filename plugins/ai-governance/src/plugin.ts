import {
  createPlugin,
  createRouteRef,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

const rootRouteRef = createRouteRef({ id: 'ai-governance' });

export const aiGovernancePlugin = createPlugin({
  id: 'ai-governance',
  routes: {
    root: rootRouteRef,
  },
});

export const GovernancePage = aiGovernancePlugin.provide(
  createRoutableExtension({
    name: 'GovernancePage',
    component: () =>
      import('./components/GovernanceDashboard').then(
        m => m.GovernanceDashboard,
      ),
    mountPoint: rootRouteRef,
  }),
);
