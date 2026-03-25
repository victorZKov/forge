/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(import('@backstage/plugin-techdocs-backend'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// See https://backstage.io/docs/auth/guest/provider

// OIDC auth (QuantumID, Entra ID, Keycloak, Auth0, or any OIDC provider)
backend.add(import('./modules/auth'));

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// permission plugin
backend.add(import('@backstage/plugin-permission-backend'));
// See https://backstage.io/docs/permissions/getting-started for how to create your own permission policy
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search engine
// See https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// kubernetes
backend.add(import('@backstage/plugin-kubernetes-backend'));

// catalog enricher (AI-powered metadata updates)
import { catalogEnricherModule } from '@internal/plugin-catalog-enricher-backend';
backend.add(catalogEnricherModule);

// AI-powered scaffolder action
import { aiScaffoldModule } from './modules/aiScaffoldModule';
backend.add(aiScaffoldModule);

// AI code review (webhook-driven PR reviews with catalog context)
import { aiCodeReviewPlugin } from '@internal/plugin-ai-code-review';
backend.add(aiCodeReviewPlugin);

// TechDocs RAG (indexes docs into pgvector, answers questions)
import { techDocsRagPlugin } from '@internal/plugin-techdocs-rag';
backend.add(techDocsRagPlugin);

backend.start();
