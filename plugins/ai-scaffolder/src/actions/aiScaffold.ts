import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import * as fs from 'fs-extra';
import * as path from 'path';

interface ScaffoldResult {
  name: string;
  description: string;
  type: string;
  dependencies: Record<string, boolean>;
  auth: string;
  kubernetes: boolean;
  nugetPackages: string[];
  envVars: string[];
  gotchaPrompt: string;
}

export function createAiScaffoldAction(aiServiceUrl: string) {
  return createTemplateAction({
    id: 'forge:ai-scaffold',
    schema: {
      input: {
        description: z => z.string().describe('Service Description'),
        owner: z => z.string().describe('Owner'),
      },
      output: {
        name: z => z.string().optional(),
        gotchaPrompt: z => z.string().optional(),
      },
    },
    async handler(ctx) {
      const { description, owner } = ctx.input;

      ctx.logger.info(`Generating scaffold for: ${description}`);
      const res = await fetch(`${aiServiceUrl}/api/scaffold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`AI scaffold service returned ${res.status}: ${body}`);
      }

      const scaffold: ScaffoldResult = await res.json() as ScaffoldResult;
      const projectDir = ctx.workspacePath;

      await fs.writeFile(
        path.join(projectDir, 'Program.cs'),
        generateProgramCs(scaffold),
      );

      await fs.writeFile(
        path.join(projectDir, `${scaffold.name}.csproj`),
        generateCsproj(scaffold),
      );

      await fs.writeFile(
        path.join(projectDir, 'appsettings.json'),
        generateAppSettings(scaffold),
      );

      await fs.writeFile(
        path.join(projectDir, 'Dockerfile'),
        generateDockerfile(scaffold),
      );

      await fs.writeFile(
        path.join(projectDir, 'catalog-info.yaml'),
        generateCatalogInfo(scaffold, owner),
      );

      await fs.writeFile(
        path.join(projectDir, 'GOTCHA.md'),
        formatGotchaPrompt(scaffold),
      );

      if (scaffold.kubernetes) {
        await fs.ensureDir(path.join(projectDir, 'k8s'));
        await fs.writeFile(
          path.join(projectDir, 'k8s', 'deployment.yaml'),
          generateK8sDeployment(scaffold),
        );
        await fs.writeFile(
          path.join(projectDir, 'k8s', 'service.yaml'),
          generateK8sService(scaffold),
        );
      }

      ctx.output('name', scaffold.name);
      ctx.output('gotchaPrompt', scaffold.gotchaPrompt);

      ctx.logger.info(`Scaffold complete: ${scaffold.name}`);
    },
  });
}

function generateProgramCs(scaffold: ScaffoldResult): string {
  const lines: string[] = [];

  if (scaffold.dependencies.postgresql) {
    lines.push('using Microsoft.EntityFrameworkCore;');
  }
  if (scaffold.dependencies.serviceBus) {
    lines.push('using Azure.Messaging.ServiceBus;');
  }
  if (scaffold.dependencies.redis) {
    lines.push('using StackExchange.Redis;');
  }
  lines.push('using Serilog;');
  lines.push('');
  lines.push('var builder = WebApplication.CreateBuilder(args);');
  lines.push('');
  lines.push('builder.Host.UseSerilog((ctx, config) =>');
  lines.push('    config.ReadFrom.Configuration(ctx.Configuration));');
  lines.push('');

  if (scaffold.dependencies.postgresql) {
    lines.push('builder.Services.AddDbContext<AppDbContext>(options =>');
    lines.push('    options.UseNpgsql(');
    lines.push('        builder.Configuration.GetConnectionString("Default")));');
    lines.push('');
  }

  if (scaffold.dependencies.serviceBus) {
    lines.push('builder.Services.AddSingleton(_ =>');
    lines.push('    new ServiceBusClient(');
    lines.push('        Environment.GetEnvironmentVariable("SERVICEBUS_CONNECTION")));');
    lines.push('');
  }

  if (scaffold.dependencies.redis) {
    lines.push('builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>');
    lines.push('    ConnectionMultiplexer.Connect(');
    lines.push('        Environment.GetEnvironmentVariable("REDIS_CONNECTION")!));');
    lines.push('');
  }

  if (scaffold.auth === 'quantumid-jwt') {
    lines.push('builder.Services');
    lines.push('    .AddAuthentication("Bearer")');
    lines.push('    .AddJwtBearer(options =>');
    lines.push('    {');
    lines.push('        options.Authority = Environment.GetEnvironmentVariable("QUANTUMID_AUTHORITY");');
    lines.push('        options.Audience = Environment.GetEnvironmentVariable("QUANTUMID_AUDIENCE");');
    lines.push('    });');
    lines.push('builder.Services.AddAuthorization();');
    lines.push('');
  }

  lines.push('var app = builder.Build();');
  lines.push('');

  if (scaffold.auth === 'quantumid-jwt') {
    lines.push('app.UseAuthentication();');
    lines.push('app.UseAuthorization();');
    lines.push('');
  }

  lines.push('app.MapGet("/healthz", () => Results.Ok("healthy"));');
  lines.push('');
  lines.push('app.Run();');

  return lines.join('\n');
}

function generateCsproj(scaffold: ScaffoldResult): string {
  const packages = scaffold.nugetPackages
    .map(p => `    <PackageReference Include="${p}" Version="*" />`)
    .join('\n');

  return `<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
${packages}
  </ItemGroup>

</Project>
`;
}

function generateAppSettings(scaffold: ScaffoldResult): string {
  const settings: Record<string, unknown> = {
    Logging: {
      LogLevel: {
        Default: 'Information',
        'Microsoft.AspNetCore': 'Warning',
      },
    },
    AllowedHosts: '*',
  };

  if (scaffold.dependencies.postgresql) {
    settings.ConnectionStrings = {
      Default: `Host=localhost;Database=${scaffold.name};Username=postgres;Password=postgres`,
    };
  }

  return JSON.stringify(settings, null, 2) + '\n';
}

function generateDockerfile(scaffold: ScaffoldResult): string {
  return `FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["${scaffold.name}.csproj", "./"]
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "${scaffold.name}.dll"]
`;
}

function generateCatalogInfo(scaffold: ScaffoldResult, owner: string): string {
  const tags = [];
  tags.push('dotnet');
  if (scaffold.dependencies.postgresql) tags.push('postgresql');
  if (scaffold.dependencies.redis) tags.push('redis');
  if (scaffold.dependencies.serviceBus) tags.push('azure-servicebus');
  if (scaffold.kubernetes) tags.push('kubernetes');

  return `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: ${scaffold.name}
  description: "${scaffold.description}"
  tags:
${tags.map(t => `    - ${t}`).join('\n')}
  annotations:
    github.com/project-slug: victorZKov/${scaffold.name}
spec:
  type: service
  lifecycle: experimental
  owner: ${owner}
`;
}

function formatGotchaPrompt(scaffold: ScaffoldResult): string {
  return `# GOTCHA Prompt — ${scaffold.name}

Use this prompt with your AI tool to develop this service.
Generated by Forge based on your service description.

${scaffold.gotchaPrompt}
`;
}

function generateK8sDeployment(scaffold: ScaffoldResult): string {
  const envVars = scaffold.envVars
    .map(v => `        - name: ${v}\n          valueFrom:\n            secretKeyRef:\n              name: ${scaffold.name}-secrets\n              key: ${v}`)
    .join('\n');

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${scaffold.name}
  labels:
    app: ${scaffold.name}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${scaffold.name}
  template:
    metadata:
      labels:
        app: ${scaffold.name}
    spec:
      containers:
        - name: ${scaffold.name}
          image: ${scaffold.name}:latest
          ports:
            - containerPort: 8080
          env:
${envVars}
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 3
            periodSeconds: 5
`;
}

function generateK8sService(scaffold: ScaffoldResult): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: ${scaffold.name}
spec:
  selector:
    app: ${scaffold.name}
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
  type: ClusterIP
`;
}
