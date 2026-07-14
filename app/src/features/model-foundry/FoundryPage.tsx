import * as React from 'react';
import { ArrowRight, CheckCircle2, Cpu, Database, FlaskConical, Gauge, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth';
import type { FoundryResult, ProjectSnapshot, TrainingJobSnapshot } from './domain';
import { DeterministicFixtureBackend, type FixtureBackendDependencies } from './fixtureBackend';
import { VersionedFixtureRepository, type StorageAdapter } from './localRepository';
import { VIBECODER_TEMPLATE } from './validation';
import { createFixtureBase, createFixtureDataset, createFixtureEvaluation } from './demoFixtures';
import {
  downloadFoundryModel,
  cancelFoundryTraining,
  getFoundryHardwareProfile,
  generateFromFoundryArtifact,
  getFoundryTrainingRuntimeStatus,
  installFoundryTrainingDependencies,
  inspectFoundryArtifact,
  listenFoundryWorkerMessages,
  resumeFoundryTraining,
  startFoundryTraining,
  stopFoundryTrainingAfterCheckpoint,
  type FoundryHardwareProfile,
  type FoundryTrainingRuntimeStatus,
} from './nativeBridge';
import { FOUNDRY_MODEL_CATALOG, modelCompatibility } from './modelRegistry';
import { DatasetStudioPanel } from './DatasetStudioPanel';
import { FoundryDeploymentRepository, type FoundryDeploymentRecord } from './deployment';
import { DeploymentPanel, EvaluationArenaPanel, ImprovementPanel } from './FoundryGovernancePanels';
import { LocalAdapterRegistry, type LocalAdapterRecord } from './adapterRegistry';
import { RealAdapterRegistryPanel } from './RealAdapterRegistryPanel';

export interface FoundryPageProps { readonly storage?: StorageAdapter; readonly dependencies?: FixtureBackendDependencies }

const browserStorage: StorageAdapter = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
const defaultDependencies: FixtureBackendDependencies = {
  clock: () => new Date().toISOString(),
  idFactory: (kind) => `${kind}-${crypto.randomUUID()}`,
};
const NATIVE_RUN_STORAGE_KEY = 'vibespace.model-foundry.native-runs.v1';

function unwrap<T>(result: FoundryResult<T>): T { if (!result.ok) throw new Error(result.error.message); return result.value }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }

interface NativeRunState {
  readonly jobId: string;
  readonly phase: string;
  readonly progress: number;
  readonly terminal: boolean;
  readonly detail: string;
}

function readPersistedNativeRun(storage: StorageAdapter, projectId: string): NativeRunState | null {
  try {
    const parsed = JSON.parse(storage.getItem(NATIVE_RUN_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    const candidate = parsed[projectId];
    if (!candidate || typeof candidate !== 'object') return null;
    const run = candidate as Partial<NativeRunState>;
    return typeof run.jobId === 'string' && typeof run.phase === 'string' && typeof run.progress === 'number' && typeof run.terminal === 'boolean' && typeof run.detail === 'string' ? run as NativeRunState : null;
  } catch { return null; }
}

function StepCard({ icon, title, detail, complete }: { icon: React.ReactNode; title: string; detail: string; complete: boolean }) {
  return <div className={cn('rounded-lg border p-3', complete ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-background/40')}>
    <div className="flex items-center gap-2 text-ui-strong"><span className={complete ? 'text-emerald-400' : 'text-muted-foreground'}>{complete ? <CheckCircle2 className="h-4 w-4" /> : icon}</span>{title}</div>
    <p className="mt-1 text-metadata text-muted-foreground">{detail}</p>
  </div>;
}

export function FoundryPage({ storage = browserStorage, dependencies = defaultDependencies }: FoundryPageProps) {
  const [backend] = React.useState(() => new DeterministicFixtureBackend(dependencies));
  const [repository] = React.useState(() => new VersionedFixtureRepository(storage, 'vibespace.model-foundry', () => dependencies.idFactory('correlation')));
  const [deployments] = React.useState(() => new FoundryDeploymentRepository(storage, dependencies.clock, () => dependencies.idFactory('deployment')));
  const [adapterRegistry] = React.useState(() => new LocalAdapterRegistry(storage, dependencies.clock));
  const [snapshot, setSnapshot] = React.useState<ProjectSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hardware, setHardware] = React.useState<FoundryHardwareProfile | null>(null);
  const [checkingHardware, setCheckingHardware] = React.useState(false);
  const [selectedModelId, setSelectedModelId] = React.useState('fixture-base');
  const [licenseApproved, setLicenseApproved] = React.useState(false);
  const [downloadStatus, setDownloadStatus] = React.useState<string | null>(null);
  const [showDatasetStudio, setShowDatasetStudio] = React.useState(false);
  const [trainingRuntime, setTrainingRuntime] = React.useState<FoundryTrainingRuntimeStatus | null>(null);
  const [runtimeApproval, setRuntimeApproval] = React.useState(false);
  const [runtimeBusy, setRuntimeBusy] = React.useState(false);
  const [nativeRun, setNativeRun] = React.useState<NativeRunState | null>(null);
  const [localAdapters, setLocalAdapters] = React.useState<readonly LocalAdapterRecord[]>([]);
  const [deployment, setDeployment] = React.useState<FoundryDeploymentRecord | null>(null);
  const [routingMode, setRoutingMode] = React.useState<FoundryDeploymentRecord['routingMode']>('manual');
  const [trafficPercent, setTrafficPercent] = React.useState(100);
  const [feedbackConsent, setFeedbackConsent] = React.useState(false);
  const [realConfig, setRealConfig] = React.useState({ method: 'lora' as 'lora' | 'qlora', seed: 7, epochs: 1, batchSize: 1, gradientAccumulation: 4, maxSequenceLength: 256, learningRate: 0.0002, loraRank: 8, loraAlpha: 16, loraDropout: 0.05 });
  const projectId = snapshot?.project.id;

  React.useEffect(() => {
    const loaded = repository.load();
    if (!loaded.ok) return setError(loaded.error.message);
    if (!loaded.value) return;
    const restored = backend.restoreProject(loaded.value);
    if (restored.ok) {
      const saved = repository.save(restored.value);
      if (!saved.ok) setError(saved.error.message); else setSnapshot(restored.value);
    } else setError(restored.error.message);
  }, [backend, repository]);

  React.useEffect(() => {
    if (!projectId) return;
    const restored = readPersistedNativeRun(storage, projectId);
    setNativeRun(restored?.terminal ? restored : restored ? { ...restored, phase: 'interrupted', terminal: true, detail: 'The desktop app restarted. Resume from the last verified checkpoint.' } : null);
  }, [projectId, storage]);

  React.useEffect(() => {
    setLocalAdapters(projectId ? adapterRegistry.list(projectId) : []);
  }, [adapterRegistry, projectId]);

  React.useEffect(() => {
    if (!projectId || !nativeRun) return;
    try {
      const parsed = JSON.parse(storage.getItem(NATIVE_RUN_STORAGE_KEY) ?? '{}') as Record<string, NativeRunState>;
      storage.setItem(NATIVE_RUN_STORAGE_KEY, JSON.stringify({ ...parsed, [projectId]: nativeRun }));
    } catch { /* Local run-state persistence is optional. */ }
  }, [nativeRun, projectId, storage]);

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenFoundryWorkerMessages((event) => {
      const message = event.message;
      const phase = typeof message.phase === 'string' ? message.phase : typeof message.state === 'string' ? message.state : 'working';
      const progress = typeof message.progress === 'number' ? message.progress : phase === 'completed' ? 1 : 0;
      const nestedError = message.error && typeof message.error === 'object' ? message.error as Record<string, unknown> : null;
      const detail = typeof message.message === 'string'
        ? message.message
        : typeof nestedError?.message === 'string'
          ? nestedError.message
          : phase.replaceAll('_', ' ');
      setNativeRun((current) => current?.jobId === event.jobId
        ? { ...current, phase, progress, detail, terminal: message.type === 'result' }
        : current);
      if (message.type === 'result' && phase === 'completed') {
        void inspectFoundryArtifact(event.projectId, event.jobId).then((artifact) => {
          const registered = adapterRegistry.upsert(event.projectId, event.jobId, artifact);
          setLocalAdapters((current) => [...current.filter((item) => item.projectId !== registered.projectId || item.jobId !== registered.jobId), registered]);
          setNativeRun((current) => current?.jobId === event.jobId
            ? { ...current, detail: `Verified adapter artifact (${Object.keys(artifact.adapterFiles).length} files, ${artifact.manifestSha256.slice(0, 12)}…).`, terminal: true }
            : current);
        }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Completed artifact verification failed.'));
      }
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, [adapterRegistry]);

  const commit = React.useCallback((next: ProjectSnapshot) => {
    const saved = repository.save(next);
    if (!saved.ok) return setError(saved.error.message);
    setSnapshot(next); setError(null);
  }, [repository]);
  const refresh = React.useCallback((projectId: string) => commit({ ...unwrap(backend.getProject(projectId)) }), [backend, commit]);
  const act = (operation: () => void) => { try { operation() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Foundry operation failed.') } };

  const activeJob = snapshot?.trainingJobs.at(-1);
  const candidate = snapshot?.modelVersions.at(-1);
  const evaluation = snapshot?.evaluationRuns.at(-1);
  const canAdvance = Boolean(activeJob && ['queued', 'preparing', 'training', 'checkpointing'].includes(activeJob.state));
  const selectedModel = FOUNDRY_MODEL_CATALOG.find((model) => model.id === selectedModelId) ?? FOUNDRY_MODEL_CATALOG[0];

  React.useEffect(() => {
    if (!projectId) return;
    const active = deployments.list(projectId).find((item) => item.status === 'active') ?? null;
    setDeployment(active);
  }, [deployments, projectId, snapshot?.championVersionId]);

const checkHardware = async () => {
    setCheckingHardware(true);
    try { setHardware(await getFoundryHardwareProfile()); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Hardware check failed.'); }
    finally { setCheckingHardware(false); }
  };
const downloadSelectedModel = async () => {
    if (!projectId || !selectedModel.download) return;
    setDownloadStatus('Downloading and verifying…');
    try {
      const result = await downloadFoundryModel({
        projectId,
        modelId: selectedModel.id,
        revision: selectedModel.revision,
        license: selectedModel.license,
        files: selectedModel.download.files.map((file) => ({
          path: file.path,
          url: file.url,
          expectedSha256: file.expectedSha256,
          expectedSizeBytes: file.approvedMaximumBytes,
        })),
        licenseApproved,
      });
      setDownloadStatus(`Verified ${Math.round(result.sizeBytes / 1_000_000)} MB offline model snapshot (${result.files.length} files).`);
      setError(null);
    } catch (caught) {
      setDownloadStatus(null);
      setError(caught instanceof Error ? caught.message : 'Model download failed.');
    }
  };
  const inspectTrainingRuntime = async () => {
    setRuntimeBusy(true);
    try { setTrainingRuntime(await getFoundryTrainingRuntimeStatus()); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Training runtime check failed.'); }
    finally { setRuntimeBusy(false); }
  };
  const installTrainingRuntime = async () => {
    const includeQlora = realConfig.method === 'qlora';
    if (!runtimeApproval) return;
    setRuntimeBusy(true);
    try { setTrainingRuntime(await installFoundryTrainingDependencies(includeQlora)); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Training runtime installation failed.'); }
    finally { setRuntimeBusy(false); }
  };
  const startRealTraining = async () => {
    if (!projectId || !snapshot?.datasetVersion || selectedModel.kind !== 'downloadable') return;
    const runtime = await getFoundryTrainingRuntimeStatus();
    setTrainingRuntime(runtime);
    if (!runtime.installed) throw new Error('Install the pinned LoRA runtime before starting real training.');
    if (realConfig.method === 'qlora' && !runtime.qloraInstalled) throw new Error('Install the optional pinned QLoRA add-on before starting a QLoRA run.');
    if (!downloadStatus?.startsWith('Verified')) throw new Error('Download and verify the complete pinned base-model snapshot first.');
    const trainExamples = snapshot.datasetVersion.examples.filter((example) => example.split === 'train').map((example) => ({ prompt: example.input, completion: example.expectedOutput }));
    const validationExamples = snapshot.datasetVersion.examples.filter((example) => example.split === 'validation').map((example) => ({ prompt: example.input, completion: example.expectedOutput }));
    if (!trainExamples.length || !validationExamples.length) throw new Error('Real training requires an approved dataset version with both train and validation examples.');
    const approved = snapshot.datasetVersion.scanSummary.status === 'passed'
      && snapshot.datasetVersion.qualitySummary.status !== 'failed'
      && snapshot.datasetVersion.licenseReport.status === 'passed'
      && snapshot.datasetVersion.secretScanReport.status === 'passed';
    if (!approved) throw new Error('The attached dataset version has not passed every approval gate.');
    const jobId = `real-${crypto.randomUUID()}`;
    setNativeRun({ jobId, phase: 'queued', progress: 0, detail: 'Submitting immutable real-training job.', terminal: false });
    try {
      await startFoundryTraining({
        projectId,
        jobId,
        modelId: selectedModel.id,
        datasetVersionId: snapshot.datasetVersion.id,
        datasetManifestHash: snapshot.datasetVersion.manifestHash,
        datasetFingerprint: snapshot.datasetVersion.fingerprint,
        datasetApproved: true,
        trainExamples,
        validationExamples,
        trainingConfig: realConfig,
      });
    } catch (caught) {
      setNativeRun((current) => current?.jobId === jobId ? { ...current, phase: 'failed', terminal: true, detail: caught instanceof Error ? caught.message : 'Could not start real training.' } : current);
      throw caught;
    }
  };
  const cancelRealTraining = async () => {
    if (!projectId || !nativeRun || nativeRun.terminal) return;
    const accepted = await cancelFoundryTraining(projectId, nativeRun.jobId);
    if (!accepted) throw new Error('The real-training worker is no longer active.');
    setNativeRun((current) => current ? { ...current, detail: 'Cancellation requested; the worker will stop safely.' } : current);
  };
  const resumeRealTraining = async () => {
    if (!projectId || !nativeRun || nativeRun.phase !== 'interrupted') return;
    setNativeRun((current) => current ? { ...current, phase: 'resuming', progress: current.progress, terminal: false, detail: 'Verifying the last checkpoint before resuming.' } : current);
    try {
      await resumeFoundryTraining(projectId, nativeRun.jobId);
    } catch (caught) {
      setNativeRun((current) => current ? { ...current, phase: 'interrupted', terminal: true, detail: caught instanceof Error ? caught.message : 'Could not resume real training.' } : current);
      throw caught;
    }
  };
  const stopRealTrainingAfterCheckpoint = async () => {
    if (!projectId || !nativeRun || nativeRun.terminal) return;
    const accepted = await stopFoundryTrainingAfterCheckpoint(projectId, nativeRun.jobId);
    if (!accepted) throw new Error('The real-training worker is no longer active.');
    setNativeRun((current) => current ? { ...current, detail: 'Will stop after the next verified checkpoint.' } : current);
  };
  const useRealAdapterInChat = () => {
    if (!projectId || !nativeRun || nativeRun.phase !== 'completed') return;
    useAuthStore.getState().setChatModelSelection({ mode: 'single', providerId: 'foundry', modelId: `${projectId}--${nativeRun.jobId}` });
    setError(null);
  };
  const useRegisteredAdapterInChat = (record: LocalAdapterRecord) => {
    useAuthStore.getState().setChatModelSelection({ mode: 'single', providerId: 'foundry', modelId: `${record.projectId}--${record.jobId}` });
    setError(null);
  };
  const archiveRegisteredAdapter = (record: LocalAdapterRecord) => setLocalAdapters(adapterRegistry.archive(record.projectId, record.jobId));
  const probeRegisteredAdapter = async (record: LocalAdapterRecord) => { const result = await generateFromFoundryArtifact({ projectId: record.projectId, jobId: record.jobId, prompt: 'Reply READY.', maxNewTokens: 8 }); setError(`Adapter probe succeeded: ${result.text.slice(0, 80)}`); };
  const activateDeployment = () => act(() => {
    if (!projectId || !snapshot?.championVersionId) return;
    const champion = snapshot.modelVersions.find((version) => version.id === snapshot.championVersionId);
    if (!champion) throw new Error('The champion artifact is unavailable for deployment.');
    setDeployment(deployments.activate({ projectId, modelVersionId: champion.id, artifactFingerprint: champion.artifactFingerprint, routingMode, trafficPercent }));
  });
  const pauseDeployment = () => act(() => {
    if (!projectId || !deployment) return;
    setDeployment(deployments.pause(projectId, deployment.id));
  });
  const recordFeedback = (rating: 'helpful' | 'not_helpful') => act(() => {
    if (!projectId || !feedbackConsent) return;
    const evidenceHash = evaluation?.caseEvidence[0]?.evidenceHash ?? candidate?.artifactFingerprint;
    if (!evidenceHash) throw new Error('Run an evaluation before recording improvement feedback.');
    unwrap(backend.recordFeedback(projectId, { rating, evidenceHash, consent: { approved: true, actorId: 'local-owner', approvedAt: dependencies.clock(), purpose: 'Improve this local specialist from reviewed feedback.' } }));
    refresh(projectId);
  });
  const createImprovementCycle = () => act(() => {
    if (!projectId || !snapshot?.feedbackEvents.length) return;
    unwrap(backend.createImprovementCycle(projectId, snapshot.feedbackEvents.map((event) => event.id), 'local-owner', 'Consented local feedback is ready for a governed training review.'));
    refresh(projectId);
  });
  const createProject = () => act(() => commit(unwrap(backend.createProject(VIBECODER_TEMPLATE))));
  const prepare = () => act(() => { if (!projectId) return; unwrap(backend.attachBaseModel(projectId, createFixtureBase(dependencies.clock()))); commit(unwrap(backend.attachDatasetVersion(projectId, createFixtureDataset(projectId, dependencies.clock())))) });
  const attachStudioDataset = (dataset: Parameters<DeterministicFixtureBackend['attachDatasetVersion']>[1]) => act(() => { if (!projectId) return; unwrap(backend.attachBaseModel(projectId, createFixtureBase(dependencies.clock()))); commit(unwrap(backend.attachDatasetVersion(projectId, dataset))); setShowDatasetStudio(false); });
  const startTraining = () => act(() => { if (!projectId) return; unwrap(backend.startTraining(projectId, { method: 'lora', config: { epochs: 1, learningRate: 0.0002, rank: 8, seed: 7, batchSize: 1, gradientAccumulationSteps: 1, sequenceLength: 256, validationSplit: 0.1 } })); refresh(projectId) });
  const advance = () => act(() => { if (!projectId || !activeJob) return; unwrap(backend.advanceTraining(projectId, activeJob.id)); refresh(projectId) });
  const resume = () => act(() => { if (!projectId || !activeJob) return; unwrap(backend.resumeTraining(projectId, activeJob.id)); refresh(projectId) });
  const evaluate = () => act(() => { if (!projectId || !candidate) return; unwrap(backend.evaluateCandidate(projectId, candidate.id, createFixtureEvaluation(dependencies.clock()))); refresh(projectId) });
  const promote = () => act(() => { if (!projectId || !candidate || !evaluation) return; unwrap(backend.promoteCandidate(projectId, candidate.id, evaluation.id, 'local-owner', 'Passed every fixture promotion gate.')); refresh(projectId) });

  return <main className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_right,hsl(var(--accent-violet)/0.10),transparent_42%)] p-5 md:p-7">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 flex items-center gap-2 text-metadata uppercase tracking-[0.18em] text-cyan-400"><FlaskConical className="h-4 w-4" /> Model Foundry</div><h1 className="text-2xl font-semibold tracking-tight">Build Your Own AI</h1><p className="mt-1 max-w-2xl text-secondary text-muted-foreground">Define a focused specialist, prepare approved local data, and earn promotion through measured gates.</p></div><Badge variant="outline" className="w-fit border-amber-500/30 text-amber-300">Fixture mode · local only</Badge></header>
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-secondary text-amber-100"><strong>Truthful simulation:</strong> fixture mode never trains weights. It exercises lifecycle, recovery, evaluation, and promotion contracts locally.</div>
      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">{error}</div>}
      {!snapshot ? <Card className="overflow-hidden border-cyan-500/20 bg-panel/90"><CardHeader className="border-b border-border bg-gradient-to-r from-cyan-500/10 to-violet-500/10"><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="text-cyan-400" /> Start with VibeCoder</CardTitle><CardDescription>A narrow coding-review specialist with local-only privacy, no tool access, and explicit evidence rules.</CardDescription></CardHeader><CardContent className="grid gap-3 pt-4 md:grid-cols-3"><StepCard icon={<ShieldCheck className="h-4 w-4" />} title="Constrained" detail="No shell, network, or external transfer." complete={false} /><StepCard icon={<Database className="h-4 w-4" />} title="Traceable" detail="Versioned data and approval provenance." complete={false} /><StepCard icon={<Cpu className="h-4 w-4" />} title="Measurable" detail="Quality, safety, and regression gates." complete={false} /><Button variant="accent" className="mt-2 md:col-span-3" onClick={createProject}>Create VibeCoder <ArrowRight /></Button></CardContent></Card> : <>
        <Card className="border-violet-500/20 bg-panel/90"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle><h2 className="text-xl">{snapshot.project.specialist.name}</h2></CardTitle><CardDescription>{snapshot.project.specialist.purpose}</CardDescription></div><Badge variant="outline" className="border-emerald-500/30 text-emerald-300">Project ready</Badge></div></CardHeader><CardContent className="grid gap-3 md:grid-cols-4"><StepCard icon={<Sparkles className="h-4 w-4" />} title="Specialist" detail="Objective and constraints locked." complete /><StepCard icon={<Database className="h-4 w-4" />} title="Data" detail={snapshot.datasetVersion ? 'Approved manifest attached.' : 'Awaiting approved inputs.'} complete={Boolean(snapshot.datasetVersion)} /><StepCard icon={<Cpu className="h-4 w-4" />} title="Training" detail={activeJob ? titleCase(activeJob.state) : 'Not started.'} complete={activeJob?.state === 'completed'} /><StepCard icon={<ShieldCheck className="h-4 w-4" />} title="Promotion" detail={snapshot.championVersionId ? 'Champion selected.' : 'Requires passing evidence.'} complete={Boolean(snapshot.championVersionId)} /></CardContent></Card>
<Card className="border-cyan-500/20"><CardContent className="flex flex-wrap items-center justify-between gap-4 pt-4"><div className="flex items-start gap-3"><Gauge className="mt-0.5 h-5 w-5 text-cyan-400" /><div><div className="text-ui-strong">Device readiness</div>{hardware ? <><div className="text-secondary text-muted-foreground">{hardware.native ? `${hardware.os} · ${hardware.architecture} · ${hardware.logicalCores} logical cores` : hardware.acceleratorDetail}</div><div className="mt-1 text-metadata text-amber-200">Recommendation: {hardware.recommendedMode.replaceAll('_', ' ')}</div></> : <div className="text-secondary text-muted-foreground">Run an honest local check before choosing real training.</div>}</div></div><Button onClick={() => void checkHardware()} disabled={checkingHardware}>{checkingHardware ? 'Checking device…' : 'Check this device'}</Button></CardContent></Card>
<Card className="border-violet-500/20"><CardHeader><CardTitle>Real training runtime</CardTitle><CardDescription>The fixture worker is lightweight. Real LoRA uses a separate, hash-pinned Python environment and is installed only after approval.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="text-secondary text-muted-foreground">{trainingRuntime?.detail ?? 'Not checked on this device.'}</div>{!trainingRuntime?.installed && <label className="flex items-start gap-2 text-secondary"><input type="checkbox" checked={runtimeApproval} onChange={(event) => setRuntimeApproval(event.target.checked)} className="mt-0.5" /><span>I approve installing the pinned real-training stack. This can be a multi-gigabyte download; it stays inside VibeSpace app data and does not modify global Python.</span></label>}<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={runtimeBusy} onClick={() => void inspectTrainingRuntime()}>{runtimeBusy ? 'Working…' : 'Check training runtime'}</Button>{!trainingRuntime?.installed && <Button variant="accent" disabled={!runtimeApproval || runtimeBusy} onClick={() => void installTrainingRuntime()}>Install pinned LoRA runtime</Button>}</div><p className="text-metadata text-muted-foreground">No dependency install starts automatically. QLoRA remains disabled unless CUDA and the optional pinned quantization runtime are both verified.</p></CardContent></Card><Card><CardHeader><CardTitle>Approved base models</CardTitle><CardDescription>Review source, immutable revision, license, size, and local resource estimate before selection.</CardDescription></CardHeader><CardContent className="space-y-3">{FOUNDRY_MODEL_CATALOG.map((model) => { const compatibility = modelCompatibility(model, hardware?.ramBytes ?? null); const selected = model.id === selectedModel.id; return <button key={model.id} type="button" aria-pressed={selected} onClick={() => { setSelectedModelId(model.id); setLicenseApproved(false); setDownloadStatus(null); }} className={cn('w-full rounded-lg border p-3 text-left transition-colors', selected ? 'border-cyan-400/50 bg-cyan-500/5' : 'border-border hover:bg-muted/40')}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-ui-strong">{model.name}</span><div className="flex gap-2"><Badge variant="outline">{model.license}</Badge><Badge variant="outline">{compatibility}</Badge></div></div><div className="mt-1 text-metadata text-muted-foreground">{model.publisher} · {model.displaySize} · {model.parameterCount.toLocaleString()} parameters · {model.format}</div><div className="mt-1 truncate text-metadata text-muted-foreground">Revision {model.revision}</div></button>; })}{selectedModel.kind === 'fixture' ? <div className="text-secondary text-emerald-300">Bundled fixture metadata selected. No model download is required.</div> : <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><label className="flex items-start gap-2 text-secondary"><input type="checkbox" checked={licenseApproved} onChange={(event) => setLicenseApproved(event.target.checked)} className="mt-0.5" /><span>I reviewed and approve the {selectedModel.license} license and the {selectedModel.displaySize} verified download.</span></label><div className="flex flex-wrap items-center gap-3"><Button variant="accent" disabled={!licenseApproved || Boolean(downloadStatus?.startsWith('Downloading'))} onClick={() => void downloadSelectedModel()}>Download and verify model</Button>{downloadStatus && <span className="text-metadata text-muted-foreground">{downloadStatus}</span>}</div><p className="text-metadata text-muted-foreground">Remote model code stays disabled. Only the six pinned, checksum-verified snapshot files are accepted.</p></div>}</CardContent></Card>
{!snapshot.datasetVersion && <div className="space-y-3"><div className="flex flex-wrap gap-2">{selectedModel.kind === 'fixture' && <Button variant="accent" onClick={prepare}>Prepare approved fixture inputs</Button>}<Button variant="outline" onClick={() => setShowDatasetStudio((visible) => !visible)}>{showDatasetStudio ? 'Close Dataset Studio' : 'Open Dataset Studio'}</Button></div>{showDatasetStudio && projectId && <DatasetStudioPanel projectId={projectId} now={dependencies.clock} onVersion={attachStudioDataset} />}</div>}
        {snapshot.datasetVersion && selectedModel.kind === 'downloadable' && <Card className="border-cyan-500/20"><CardHeader><CardTitle>Training Lab</CardTitle><CardDescription>Build a bounded LoRA or QLoRA run from immutable local inputs. The worker refuses to silently change these settings.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><label className="space-y-1"><span className="text-metadata text-muted-foreground">Method</span><select value={realConfig.method} onChange={(event) => setRealConfig((config) => ({ ...config, method: event.target.value as 'lora' | 'qlora' }))} className="h-9 w-full rounded-md border border-input bg-background px-3"><option value="lora">LoRA</option><option value="qlora">QLoRA (verified CUDA only)</option></select></label><label className="space-y-1"><span className="text-metadata text-muted-foreground">Epochs</span><input type="number" min={1} max={50} value={realConfig.epochs} onChange={(event) => setRealConfig((config) => ({ ...config, epochs: Number(event.target.value) }))} className="h-9 w-full rounded-md border border-input bg-background px-3" /></label><label className="space-y-1"><span className="text-metadata text-muted-foreground">Batch size</span><input type="number" min={1} max={64} value={realConfig.batchSize} onChange={(event) => setRealConfig((config) => ({ ...config, batchSize: Number(event.target.value) }))} className="h-9 w-full rounded-md border border-input bg-background px-3" /></label><label className="space-y-1"><span className="text-metadata text-muted-foreground">Gradient accumulation</span><input type="number" min={1} max={1024} value={realConfig.gradientAccumulation} onChange={(event) => setRealConfig((config) => ({ ...config, gradientAccumulation: Number(event.target.value) }))} className="h-9 w-full rounded-md border border-input bg-background px-3" /></label><label className="space-y-1"><span className="text-metadata text-muted-foreground">Sequence length</span><input type="number" min={64} max={32768} step={64} value={realConfig.maxSequenceLength} onChange={(event) => setRealConfig((config) => ({ ...config, maxSequenceLength: Number(event.target.value) }))} className="h-9 w-full rounded-md border border-input bg-background px-3" /></label><label className="space-y-1"><span className="text-metadata text-muted-foreground">LoRA rank</span><input type="number" min={1} max={512} value={realConfig.loraRank} onChange={(event) => setRealConfig((config) => ({ ...config, loraRank: Number(event.target.value), loraAlpha: Math.max(config.loraAlpha, Number(event.target.value) * 2) }))} className="h-9 w-full rounded-md border border-input bg-background px-3" /></label><label className="space-y-1"><span className="text-metadata text-muted-foreground">Learning rate</span><input type="number" min={0.000001} max={1} step={0.0001} value={realConfig.learningRate} onChange={(event) => setRealConfig((config) => ({ ...config, learningRate: Number(event.target.value) }))} className="h-9 w-full rounded-md border border-input bg-background px-3" /></label></div><div className="text-secondary text-muted-foreground">{nativeRun ? nativeRun.detail : 'Requires the verified model snapshot, installed pinned runtime, and an approved dataset with train and validation splits.'}</div>{nativeRun && <><div className="flex items-center justify-between text-metadata text-muted-foreground"><span>{titleCase(nativeRun.phase.replaceAll('_', ' '))}</span><span>{Math.round(nativeRun.progress * 100)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${nativeRun.progress * 100}%` }} /></div></>}<div className="flex flex-wrap gap-2"><Button variant="accent" disabled={Boolean(nativeRun && !nativeRun.terminal)} onClick={() => void startRealTraining().catch((caught) => setError(caught instanceof Error ? caught.message : 'Real training could not start.'))}>Start real training</Button>{nativeRun?.phase === 'interrupted' && <Button variant="accent" onClick={() => void resumeRealTraining().catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not resume real training.'))}>Resume real run</Button>}{nativeRun && !nativeRun.terminal && <><Button variant="outline" onClick={() => void stopRealTrainingAfterCheckpoint().catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not stop after checkpoint.'))}>Stop after checkpoint</Button><Button variant="outline" onClick={() => void cancelRealTraining().catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not cancel training.'))}>Cancel real run</Button></>}</div><p className="text-metadata text-muted-foreground">QLoRA fails closed without verified CUDA and pinned bitsandbytes. Out-of-memory errors preserve this configuration and return concrete reductions to try.</p></CardContent></Card>}
        {snapshot.datasetVersion && selectedModel.kind === 'fixture' && !activeJob && <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4"><div><div className="text-ui-strong">{snapshot.datasetVersion.examples.length} approved {snapshot.datasetVersion.examples.length === 1 ? 'example' : 'examples'}</div><div className="text-secondary text-muted-foreground">Fixture Base · Apache-2.0</div></div><Button onClick={startTraining}>Start fixture training</Button></CardContent></Card>}
        {nativeRun?.phase === 'completed' && nativeRun.detail.startsWith('Verified adapter artifact') && selectedModel.kind === 'downloadable' && <Card className="border-emerald-500/25"><CardHeader><CardTitle>Verified local adapter</CardTitle><CardDescription>This adapter passed immutable artifact verification. Select it for the next chat; inference remains fully local.</CardDescription></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><div className="text-metadata text-muted-foreground">Model ID: {projectId}--{nativeRun.jobId}</div><Button variant="accent" onClick={useRealAdapterInChat}>Use in chat</Button></CardContent></Card>}
        <RealAdapterRegistryPanel records={localAdapters} runtimeReady={Boolean(trainingRuntime?.installed)} onUse={useRegisteredAdapterInChat} onProbe={(record) => void probeRegisteredAdapter(record).catch((caught) => setError(caught instanceof Error ? caught.message : 'Adapter probe failed.'))} onArchive={archiveRegisteredAdapter} />
        {activeJob && <TrainingRegion job={activeJob} active={canAdvance} onAdvance={advance} onResume={resume} />}
        {evaluation && <div role="status" className="sr-only"><span>{evaluation.gate.result === 'pass' ? 'All gates passed' : 'Evaluation gates are blocked'}</span><span>{evaluation.safetyFailures.length} safety failures</span></div>}
        {activeJob?.state === 'completed' && candidate && <EvaluationArenaPanel candidate={candidate} evaluation={evaluation} championVersionId={snapshot.championVersionId} onEvaluate={evaluate} onPromote={promote} />}
        <DeploymentPanel snapshot={snapshot} deployment={deployment} routingMode={routingMode} trafficPercent={trafficPercent} onRoutingMode={setRoutingMode} onTrafficPercent={setTrafficPercent} onActivate={activateDeployment} onPause={pauseDeployment} />
        <ImprovementPanel feedbackCount={snapshot.feedbackEvents.length} cycleCount={snapshot.improvementCycles.length} consentApproved={feedbackConsent} onConsent={setFeedbackConsent} onFeedback={recordFeedback} onCycle={createImprovementCycle} />
      </>}
    </div>
  </main>;
}

function TrainingRegion({ job, active, onAdvance, onResume }: { job: TrainingJobSnapshot; active: boolean; onAdvance: () => void; onResume: () => void }) {
  return <Card role="region" aria-label="Training job" className="border-cyan-500/20"><CardContent className="pt-4"><div className="flex items-center justify-between gap-3"><div><div className="text-ui-strong">{titleCase(job.state)}</div><div className="text-secondary text-muted-foreground">{Math.round(job.progress * 100)}% · deterministic fixture worker</div></div>{active && <Button onClick={onAdvance}>Advance fixture job</Button>}{job.state === 'interrupted' && <Button onClick={onResume}>Resume fixture job</Button>}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${job.progress * 100}%` }} /></div>{job.state === 'completed' && <p className="mt-3 text-metadata text-amber-200">Fixture completed: no model training or GPU work occurred.</p>}</CardContent></Card>;
}
