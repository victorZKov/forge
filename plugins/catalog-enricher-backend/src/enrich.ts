import { Entity } from '@backstage/catalog-model';
import { Octokit } from '@octokit/rest';

interface EnrichmentResult {
  description: string;
  tags: string[];
  dependencies: string[];
  apiEndpoints: string[];
}

interface EnrichOptions {
  entity: Entity;
  octokit: Octokit;
  aiServiceUrl: string;
  logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

export async function enrichEntity({
  entity,
  octokit,
  aiServiceUrl,
  logger,
}: EnrichOptions): Promise<boolean> {
  const slug =
    entity.metadata.annotations?.['github.com/project-slug'];
  if (!slug) {
    logger.warn(`${entity.metadata.name}: no github.com/project-slug annotation, skipping`);
    return false;
  }

  const [owner, repo] = slug.split('/');

  // Fetch the repo tree to find relevant files
  const { data: tree } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: 'main',
    recursive: 'true',
  });

  const targetFiles = tree.tree.filter(
    f =>
      f.type === 'blob' &&
      f.path &&
      (f.path === 'Program.cs' ||
        f.path === 'package.json' ||
        f.path.endsWith('.csproj') ||
        f.path === 'Dockerfile' ||
        f.path === 'appsettings.json' ||
        f.path === 'app-config.yaml' ||
        f.path === 'main.tf' ||
        f.path === 'variables.tf' ||
        f.path === 'outputs.tf' ||
        f.path === 'versions.tf'),
  );

  const files: Array<{ path: string; content: string }> = [];

  for (const file of targetFiles) {
    if (!file.path) continue;
    try {
      const { data: content } = await octokit.repos.getContent({
        owner,
        repo,
        path: file.path,
        mediaType: { format: 'raw' },
      });
      files.push({ path: file.path, content: content as unknown as string });
    } catch {
      // File not readable — skip
    }
  }

  if (files.length === 0) {
    logger.info(`${entity.metadata.name}: no readable files, skipping`);
    return false;
  }

  // Call AI service
  const res = await fetch(`${aiServiceUrl}/api/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });

  if (!res.ok) {
    throw new Error(`AI service returned ${res.status}: ${await res.text()}`);
  }

  const enrichment: EnrichmentResult = await res.json() as EnrichmentResult;

  // Compare with current metadata
  const currentDesc = entity.metadata.description ?? '';
  const currentTags = (entity.metadata.tags ?? []) as string[];

  const descChanged = enrichment.description !== currentDesc;
  const tagsChanged =
    JSON.stringify(enrichment.tags.sort()) !==
    JSON.stringify([...currentTags].sort());

  if (!descChanged && !tagsChanged) {
    logger.info(`${entity.metadata.name}: no changes detected`);
    return false;
  }

  logger.info(
    `${entity.metadata.name}: changes detected — description: ${descChanged}, tags: ${tagsChanged}`,
  );
  logger.info(
    `Proposed: description="${enrichment.description}", tags=[${enrichment.tags.join(', ')}]`,
  );

  return true;
}
