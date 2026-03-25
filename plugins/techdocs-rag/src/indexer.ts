import type { Entity } from '@backstage/catalog-model';
import type { LoggerService } from '@backstage/backend-plugin-api';
import { Octokit } from '@octokit/rest';

interface IndexOptions {
  entity: Entity;
  aiServiceUrl: string;
  logger: LoggerService;
}

export async function indexEntityDocs({
  entity,
  aiServiceUrl,
  logger,
}: IndexOptions): Promise<number> {
  const slug =
    entity.metadata.annotations?.['github.com/project-slug'];
  if (!slug) return 0;

  const [owner, repo] = slug.split('/');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const entityRef = `component:default/${entity.metadata.name}`;

  let tree;
  try {
    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: 'main',
      recursive: 'true',
    });
    tree = data.tree;
  } catch {
    return 0;
  }

  const docFiles = tree.filter(
    f =>
      f.type === 'blob' &&
      f.path &&
      (f.path.startsWith('docs/') || f.path === 'GOTCHA.md') &&
      f.path.endsWith('.md'),
  );

  if (docFiles.length === 0) return 0;

  logger.info(
    `Indexing ${docFiles.length} docs for ${entity.metadata.name}`,
  );

  let indexed = 0;
  for (const file of docFiles) {
    if (!file.path) continue;

    try {
      const { data: content } = await octokit.repos.getContent({
        owner,
        repo,
        path: file.path,
        mediaType: { format: 'raw' },
      });

      const res = await fetch(`${aiServiceUrl}/api/index-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityRef,
          docPath: file.path,
          content: content as unknown as string,
        }),
      });

      if (res.ok) indexed++;
    } catch (err) {
      logger.info(`Could not index ${file.path}: ${err}`);
    }
  }

  return indexed;
}
