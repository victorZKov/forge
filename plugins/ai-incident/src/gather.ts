import type { Entity } from '@backstage/catalog-model';
import type { LoggerService } from '@backstage/backend-plugin-api';
import { Octokit } from '@octokit/rest';

interface IncidentContext {
  serviceName: string;
  serviceDescription: string;
  dependencies: string[];
  tags: string[];
  recentDeployments: string;
  recentErrors: string;
  gotchaHeuristics: string;
}

export async function gatherIncidentContext(
  entity: Entity,
  logger: LoggerService,
): Promise<IncidentContext> {
  const slug =
    entity.metadata.annotations?.['github.com/project-slug'] ?? '';
  const [owner, repo] = slug.split('/');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  const serviceName = entity.metadata.name;
  const serviceDescription = entity.metadata.description ?? 'No description';
  const tags = (entity.metadata.tags as string[]) ?? [];
  const dependencies = tags;

  let recentDeployments = 'No deployment data available.';
  if (owner && repo) {
    try {
      const { data: commits } = await octokit.repos.listCommits({
        owner,
        repo,
        per_page: 5,
      });

      recentDeployments = commits
        .map(
          c =>
            `${c.commit.author?.date} — ${c.commit.message} (${c.sha.slice(0, 7)})`,
        )
        .join('\n');
    } catch {
      logger.info(`Could not fetch commits for ${slug}`);
    }
  }

  let gotchaHeuristics = 'No GOTCHA.md found.';
  if (owner && repo) {
    try {
      const { data: gotchaFile } = await octokit.repos.getContent({
        owner,
        repo,
        path: 'GOTCHA.md',
        mediaType: { format: 'raw' },
      });
      const gotchaContent = gotchaFile as unknown as string;

      const heuristicsMatch = gotchaContent.match(
        /## HEURISTICS\s*\n([\s\S]*?)(?=\n## [A-Z]|\n---|\$)/,
      );
      if (heuristicsMatch) {
        gotchaHeuristics = heuristicsMatch[1].trim();
      }
    } catch {
      // No GOTCHA.md
    }
  }

  const recentErrors =
    'Connect to log aggregator API to fetch recent errors.';

  return {
    serviceName,
    serviceDescription,
    dependencies,
    tags,
    recentDeployments,
    recentErrors,
    gotchaHeuristics,
  };
}
