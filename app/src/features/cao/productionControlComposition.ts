import type { JarvisDexie } from '@/lib/db/database';
import type { CaoControlAction, CaoResolvedControlTarget } from './controlCommand';
import {
  createProductionCaoControlActionAdapters,
  type CaoCanonicalActionCapabilities,
} from './productionControlActionAdapters';
import {
  createProductionCaoControlRuntime,
  type CaoControlJournalRecordAdapter,
  type ProductionCaoControlRuntimeDependencies,
} from './productionControlRuntime';
import { createProductionCaoTargetRegistry } from './productionTargetRegistry';

export type ProductionCaoControlCompositionDependencies = Omit<
  ProductionCaoControlRuntimeDependencies,
  'records' | 'registry' | 'actions' | 'cancelRun'
> &
  Readonly<{
    database: JarvisDexie;
    records?: CaoControlJournalRecordAdapter;
    cancelRun?: (runId: string) => Promise<void>;
    capabilities: CaoCanonicalActionCapabilities;
  }>;

export function createProductionCaoControlComposition(
  dependencies: ProductionCaoControlCompositionDependencies,
) {
  if (
    !dependencies?.records ||
    typeof dependencies.records.load !== 'function' ||
    typeof dependencies.records.save !== 'function'
  ) {
    throw new Error('cao_control_record_repository_unavailable');
  }
  if (typeof dependencies.cancelRun !== 'function') {
    throw new Error('cao_control_cancellation_authority_unavailable');
  }

  const registry = createProductionCaoTargetRegistry(dependencies.database, dependencies.now);
  const actionBundle = createProductionCaoControlActionAdapters({
    registry,
    capabilities: dependencies.capabilities,
  });
  const runtime = createProductionCaoControlRuntime({
    records: dependencies.records,
    journal: dependencies.journal,
    events: dependencies.events,
    approvals: dependencies.approvals,
    requestApproval: dependencies.requestApproval,
    registry,
    actions: actionBundle.actions,
    cancelRun: dependencies.cancelRun,
    now: dependencies.now,
    newRunId: dependencies.newRunId,
    newLeaseId: dependencies.newLeaseId,
    leaseMs: dependencies.leaseMs,
  });

  return Object.freeze({
    async run(input: Parameters<typeof runtime.run>[0]) {
      actionBundle.assertAvailable(
        input.command.action as CaoControlAction,
        input.targets as readonly CaoResolvedControlTarget[],
      );
      return runtime.run(input);
    },
    cancel: runtime.cancel,
  });
}
