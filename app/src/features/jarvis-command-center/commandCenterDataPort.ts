import type {
  JarvisAccountLiveEvidenceReadPort,
  JarvisArtifactV1,
  JarvisEvent,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import type {
  JarvisArtifactRepository,
  JarvisEventRepository,
  JarvisRunRepository,
} from '@/lib/db/jarvisRepositories';
import type { JarvisCommandCenterDataPort } from './types';

const RUN_REPOSITORY_READ_LIMIT = 500;

function boundedLimit(requestedLimit: number): number {
  return Math.min(500, Math.max(1, requestedLimit));
}

export function createJarvisCommandCenterDataPort(input: {
  repositories: Readonly<{
    runs: JarvisRunRepository;
    events: JarvisEventRepository;
    artifacts: Readonly<JarvisArtifactRepository>;
  }>;
  liveEvidence: JarvisAccountLiveEvidenceReadPort;
  subscribeJournal(accountId: string, chatId: string, listener: () => void): () => void;
}): JarvisCommandCenterDataPort {
  const assertLiveAccount = (accountId: string) => {
    if (accountId !== input.liveEvidence.accountId) {
      throw new Error('jarvis_command_center_account_mismatch');
    }
  };

  const port: JarvisCommandCenterDataPort = {
    async getRunsForChat(request): Promise<readonly JarvisRun[]> {
      const rows = await input.repositories.runs.listByAccount(request.accountId, {
        limit: RUN_REPOSITORY_READ_LIMIT,
      });
      return rows
        .filter((run) => run.accountId === request.accountId && run.chatId === request.chatId)
        .slice(0, boundedLimit(request.limit));
    },
    async getEventsForRun(request): Promise<readonly JarvisEvent[]> {
      const rows = await input.repositories.events.listByRun(request.accountId, request.runId, {
        limit: boundedLimit(request.limit),
      });
      return rows.filter((event) => event.runId === request.runId);
    },
    async getArtifactsForRun(request): Promise<readonly JarvisArtifactV1[]> {
      const rows = await input.repositories.artifacts.listByRun(
        request.accountId,
        request.runId,
        boundedLimit(request.limit),
      );
      return rows.filter(
        (artifact) => artifact.schemaVersion === 1 && artifact.runId === request.runId,
      );
    },
    async getLiveEvidenceSnapshot(request) {
      assertLiveAccount(request.accountId);
      return input.liveEvidence.snapshot(request.runId);
    },
    subscribe(accountId, chatId, listener) {
      assertLiveAccount(accountId);
      return input.subscribeJournal(accountId, chatId, listener);
    },
    subscribeLiveEvidence(request, listener) {
      assertLiveAccount(request.accountId);
      return input.liveEvidence.subscribe(request.runId, listener);
    },
  };

  return port;
}
