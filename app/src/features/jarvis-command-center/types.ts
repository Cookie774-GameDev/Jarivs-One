import type {
  JarvisAccountLiveEvidenceReadPort,
  JarvisArtifactV1,
  JarvisCancellationRequestResult,
  JarvisEvent,
  JarvisLiveCapabilityCategory,
  JarvisLiveEvidenceSnapshot,
  JarvisLiveSystemNode,
  JarvisRun,
} from '@/lib/jarvis/contracts/execution';
import type { ScheduledJarvisAttemptResult } from '@/features/schedule/jarvisScheduleDispatch';

export type JarvisCommandCenterExpansion = 'collapsed' | 'expanded';
export type JarvisCommandCenterTab = 'outputs' | 'live_systems';

export type JarvisCommandCenterHostPort = Readonly<{
  accountId: string;
  liveEvidence: JarvisAccountLiveEvidenceReadPort;
  requestCancellation(runId: string): Promise<JarvisCancellationRequestResult>;
  retryScheduledTransport(runId: string): Promise<ScheduledJarvisAttemptResult>;
  retryLogicalRun(runId: string): Promise<ScheduledJarvisAttemptResult>;
}>;

export type JarvisCommandCenterHandlers = {
  cancelRun?: (accountId: string, runId: string) => Promise<JarvisCancellationRequestResult>;
  retryScheduledTransport?: (
    accountId: string,
    runId: string,
  ) => Promise<ScheduledJarvisAttemptResult>;
  retryLogicalRun?: (accountId: string, runId: string) => Promise<ScheduledJarvisAttemptResult>;
};

export type JarvisCommandCenterRetryState =
  | { kind: 'none' }
  | {
      kind: 'scheduled_transport_available';
      runId: string;
      attemptNumber: number;
    }
  | {
      kind: 'logical_retry_available';
      previousRunId: string;
      terminalStatus: 'failed' | 'timed_out' | 'cancelled';
    };

export type JarvisCommandCenterDataPort = {
  getRunsForChat(input: {
    accountId: string;
    chatId: string;
    limit: number;
  }): Promise<readonly JarvisRun[]>;
  getEventsForRun(input: {
    accountId: string;
    runId: string;
    limit: number;
  }): Promise<readonly JarvisEvent[]>;
  getArtifactsForRun(input: {
    accountId: string;
    runId: string;
    limit: number;
  }): Promise<readonly JarvisArtifactV1[]>;
  getLiveEvidenceSnapshot(input: {
    accountId: string;
    runId: string;
  }): Promise<JarvisLiveEvidenceSnapshot | undefined>;
  subscribe(accountId: string, chatId: string, listener: () => void): () => void;
  subscribeLiveEvidence?(
    input: { accountId: string; runId: string },
    listener: () => void,
  ): () => void;
};

export type JarvisCommandCenterSnapshot = {
  accountId: string;
  chatId: string;
  expansion: JarvisCommandCenterExpansion;
  activeTab: JarvisCommandCenterTab;
  currentRun?: JarvisRun;
  retryState: JarvisCommandCenterRetryState;
  events: readonly JarvisEvent[];
  outputs: readonly JarvisArtifactV1[];
  liveSystems:
    | { state: 'not_loaded' }
    | { state: 'loading' }
    | { state: 'ready'; nodes: readonly JarvisLiveSystemNode[] }
    | { state: 'unavailable'; reason: string };
  error?: string;
};

export type {
  JarvisAccountLiveEvidenceReadPort,
  JarvisArtifactV1,
  JarvisCancellationRequestResult,
  JarvisEvent,
  JarvisLiveCapabilityCategory,
  JarvisLiveEvidenceSnapshot,
  JarvisLiveSystemNode,
  JarvisRun,
  ScheduledJarvisAttemptResult,
};
