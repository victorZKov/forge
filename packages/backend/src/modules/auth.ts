import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { oidcAuthenticator } from '@backstage/plugin-auth-backend-module-oidc-provider';

/**
 * OIDC sign-in module for Backstage.
 *
 * Works with any OIDC provider: QuantumID, Entra ID, Keycloak, Auth0.
 * Configure the provider URL via OIDC_METADATA_URL in app-config.yaml.
 */
export default createBackendModule({
  pluginId: 'auth',
  moduleId: 'oidc-sign-in',
  register(reg) {
    reg.registerInit({
      deps: { providers: authProvidersExtensionPoint },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'oidc',
          factory: createOAuthProviderFactory({
            authenticator: oidcAuthenticator,
            signInResolver: async ({ profile }, ctx) => {
              if (!profile.email) {
                throw new Error('OIDC profile missing email');
              }
              const userEntityRef = `user:default/${profile.email!.split('@')[0]}`;
              return ctx.signInWithCatalogUser({
                filter: { 'spec.profile.email': profile.email },
              }).catch(() => {
                // Auto-provision user on first login
                return ctx.issueToken({
                  claims: {
                    sub: userEntityRef,
                    ent: [userEntityRef],
                  },
                });
              });
            },
          }),
        });
      },
    });
  },
});
