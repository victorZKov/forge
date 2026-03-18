# Forge — AI-Native Internal Developer Platform

An Internal Developer Platform built on [Backstage](https://backstage.io) where AI is a first-class citizen.

Built as part of the [AI-Native IDP](https://blog.victorz.cloud/series/ai-native-idp) article series on [blog.victorz.cloud](https://blog.victorz.cloud).

## What's Here (Article 1)

- Backstage project configuration with OIDC authentication
- Software Catalog with two registered services (users-api, scraper-agent)
- A basic .NET API Software Template

This is the foundation. AI-powered plugins are coming in the next articles.

## Tech Stack

The articles explain each technology choice and alternatives. The code in this repo uses:

| Layer | Implementation |
|-------|---------------|
| IDP | [Backstage](https://backstage.io) 1.35+ (new backend system) |
| Auth | [QuantumID](https://quantumapi.eu) (any OIDC provider works) |
| AI | [Mistral Large](https://mistral.ai) via [Scaleway](https://www.scaleway.com/en/generative-apis/) (any OpenAI-compatible API works) |
| Embeddings | mistral-embed via Scaleway |
| Vector Store | PostgreSQL + pgvector |
| K8s | Scaleway Kapsule (AKS, EKS, or any cluster works) |
| CI/CD | Azure DevOps (GitHub Actions, GitLab CI also work) |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+ with pgvector
- An OIDC provider account ([QuantumID](https://auth.quantumapi.eu/Account/Register?plan=business-beta&culture=en&ui-culture=en), Entra ID, Keycloak, Auth0)

### Setup

```bash
pnpm install

cp .env.example .env
# Edit .env with your OIDC credentials and AI provider config

pnpm dev
```

Open http://localhost:3000.

## Structure

```
forge/
├── app-config.yaml             # Backstage config (auth, catalog, DB)
├── catalog/
│   └── all.yaml                # Local catalog entities (services, APIs)
├── templates/
│   └── dotnet-api/             # .NET API scaffolder template
│       ├── template.yaml
│       └── skeleton/
│           └── catalog-info.yaml
├── .env.example                # Environment variables template
└── README.md
```

## Article Tags

Each article adds features. Use git tags to follow along:

| Tag | Article | What's Added |
|-----|---------|-------------|
| `article-01` | Why Your IDP Doesn't Help | Backstage + OIDC auth + catalog + template |
| `article-02` | Teaching Your Catalog to Think | AI auto-documentation plugin |
| `article-03` | AI-Powered Software Templates | Natural language scaffolder |
| `article-04` | The AI Code Review Plugin | PR review with catalog context |
| `article-05` | TechDocs That Answer Back | RAG over internal docs |
| `article-06` | The Governance Dashboard | AI usage metrics |
| `article-07` | AI-Assisted Incident Response | Alert correlation + runbooks |
| `article-08` | The Complete AI-Native IDP | Reference architecture + K8s deploy |

## License

MIT
