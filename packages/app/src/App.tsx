import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import searchPlugin from '@backstage/plugin-search/alpha';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import { navModule } from './modules/nav';

export default createApp({
  features: [
    catalogPlugin,
    scaffolderPlugin,
    searchPlugin,
    userSettingsPlugin,
    navModule,
  ],
});
