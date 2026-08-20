import {
  getDevelopmentGitHubAppConfig,
  getDevelopmentGitHubCredentials,
} from './kaviar-ai.github-app';

import {
  publishDevelopmentCommit,
  type DevelopmentPublishResult,
} from './kaviar-ai.development-publisher';

export interface DevelopmentPublishCandidate {
  jobId: string;
  workspace: string;
  resultBranch?: string;
  resultCommitSha?: string;
  changedPaths?: string[];
}

export interface DevelopmentPublishOrchestratorDeps {
  getConfig?: typeof getDevelopmentGitHubAppConfig;
  getCredentials?: typeof getDevelopmentGitHubCredentials;
  publish?: typeof publishDevelopmentCommit;
}

export async function publishDevelopmentJobResult(
  candidate: DevelopmentPublishCandidate,
  deps: DevelopmentPublishOrchestratorDeps = {},
): Promise<DevelopmentPublishResult> {
  const jobId = candidate.jobId.trim();
  const workspace = candidate.workspace.trim();
  const branch = candidate.resultBranch?.trim() ?? '';
  const commitSha =
    candidate.resultCommitSha?.trim() ?? '';
  const changedPaths =
    candidate.changedPaths ?? [];

  if (
    !jobId ||
    !workspace ||
    !branch ||
    !commitSha ||
    !changedPaths.length
  ) {
    throw new Error(
      'DEVELOPMENT_PUBLISH_RESULT_INCOMPLETE',
    );
  }

  const getConfig =
    deps.getConfig ??
    getDevelopmentGitHubAppConfig;

  const getCredentials =
    deps.getCredentials ??
    getDevelopmentGitHubCredentials;

  const publish =
    deps.publish ??
    publishDevelopmentCommit;

  const config = getConfig();

  const credentials =
    await getCredentials(config);

  return publish(
    {
      jobId,
      workspace,
      branch,
      commitSha,
      changedPaths,
    },
    {
      repositoryUrl:
        credentials.repositoryUrl,
      installationToken:
        credentials.installationToken,
    },
  );
}
