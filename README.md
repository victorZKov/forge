# Forge — AI-Native Internal Developer Platform

An Internal Developer Platform built on [Backstage](https://backstage.io) where AI is a first-class citizen.

Built as part of the [AI-Native IDP](https://victorz.cloud/series/ai-native-idp) article series on [victorz.cloud](https://victorz.cloud).

## What's Here (Article 1)

- Backstage project configuration with [QuantumID](https://quantumapi.eu) OIDC authentication
- Software Catalog with two registered services (users-api, scraper-agent)
- A basic .NET API Software Template

This is the foundation. AI-powered plugins are coming in the next articles.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL 16+
- A [QuantumID](https://quantumapi.eu) account ([register here](https://auth.quantumapi.eu/Account/Register?plan=business-beta&culture=en&ui-culture=en))

### Setup

```bash
pnpm install

cp .env.example .env
# Edit .env with your QuantumID credentials

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

## License

MIT
