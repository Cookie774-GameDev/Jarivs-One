import type { JarvisDexie } from '@/lib/db/database';
import type { CaoControlAction, CaoResolvedControlTarget } from './controlCommand';
import { createProductionCaoControlRecordRepository } from './productionControlRecordRepository';
import {
  createProductionCaoControlCapabilities,
  type CaoCanonicalControlAuthorities,
} from './productionControlCapabilityPorts';
import { createProductionCaoControlActionAdapters } from './productionControlActionAdapters';
import {
  createProductionCaoControlRuntime,
  type ProductionCaoControlRuntimeDependencies,
} from './productionControlRuntime';
import { createProductionCaoTargetRegistry } from './productionTargetRegistry';

export type ProductionCaoControlCompositionDependencies = Omit<
  ProductionCaoControlRuntimeDependencies,
  'records' | 'registry' | 'actions' | 'cancelRun'
> &
  Readonly<{
    database: JarvisDexie;
    cancelRun?: (runId: string) => Promise<void>;
    authorities: CaoCanonicalControlAuthorities;
  }>;

export function createProductionCaoControlComposition(
  dependencies: ProductionCaoControlCompositionDependencies,
) {
  const records = createProductionCaoControlRecordRepository(dependencies?.database);
  if (typeof dependencies.cancelRun !== 'function') {
    throw new Error('cao_control_cancellation_authority_unavailable');
  }

  const registry = createProductionCaoTargetRegistry(dependencies.database, dependencies.now);
  const actionBundle = createProductionCaoControlActionAdapters({
    registry,
    capabilities: createProductionCaoControlCapabilities(dependencies.authorities),
  });
  const runtime = createProductionCaoControlRuntime({
    records,
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
