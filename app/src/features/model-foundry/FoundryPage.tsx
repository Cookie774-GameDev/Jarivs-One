import * as React from 'react';
import { ArrowRight, CheckCircle2, Cpu, Database, FlaskConical, Gauge, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import type { FoundryResult, ProjectSnapshot, TrainingJobSnapshot } from './domain';
import { DeterministicFixtureBackend, type FixtureBackendDependencies } from './fixtureBackend';
import { VersionedFixtureRepository, type StorageAdapter } from './localRepository';
import { VIBECODER_TEMPLATE } from './validation';
import { createFixtureBase, createFixtureDataset, createFixtureEvaluation } from './demoFixtures';
import { downloadFoundryModel, getFoundryHardwareProfile, type FoundryHardwareProfile } from './nativeBridge';
import { FOUNDRY_MODEL_CATALOG, modelCompatibility } from './modelRegistry';
import { DatasetStudioPanel } from './DatasetStudioPanel';

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

function unwrap<T>(result: FoundryResult<T>): T { if (!result.ok) throw new Error(result.error.message); return result.value }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }

function StepCard({ icon, title, detail, complete }: { icon: React.ReactNode; title: string; detail: string; complete: boolean }) {
  return <div className={cn('rounded-lg border p-3', complete ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-background/40')}>
    <div className="flex items-center gap-2 text-ui-strong"><span className={complete ? 'text-emerald-400' : 'text-muted-foreground'}>{complete ? <CheckCircle2 className="h-4 w-4" /> : icon}</span>{title}</div>
    <p className="mt-1 text-metadata text-muted-foreground">{detail}</p>
  </div>;
}

export function FoundryPage({ storage = browserStorage, dependencies = defaultDependencies }: FoundryPageProps) {
  const [backend] = React.useState(() => new DeterministicFixtureBackend(dependencies));
  const [repository] = React.useState(() => new VersionedFixtureRepository(storage, 'vibespace.model-foundry', () => dependencies.idFactory('correlation')));
  const [snapshot, setSnapshot] = React.useState<ProjectSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hardware, setHardware] = React.useState<FoundryHardwareProfile | null>(null);
  const [checkingHardware, setCheckingHardware] = React.useState(false);
  const [selectedModelId, setSelectedModelId] = React.useState('fixture-base');
  const [licenseApproved, setLicenseApproved] = React.useState(false);
  const [downloadStatus, setDownloadStatus] = React.useState<string | null>(null);
  const [showDatasetStudio, setShowDatasetStudio] = React.useState(false);

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

  const commit = React.useCallback((next: ProjectSnapshot) => {
    const saved = repository.save(next);
    if (!saved.ok) return setError(saved.error.message);
    setSnapshot(next); setError(null);
  }, [repository]);
  const refresh = React.useCallback((projectId: string) => commit(unwrap(backend.getProject(projectId))), [backend, commit]);
  const act = (operation: () => void) => { try { operation() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Foundry operation failed.') } };

  const projectId = snapshot?.project.id;
  const activeJob = snapshot?.trainingJobs.at(-1);
  const candidate = snapshot?.modelVersions.at(-1);
  const evaluation = snapshot?.evaluationRuns.at(-1);
  const canAdvance = Boolean(activeJob && ['queued', 'preparing', 'training', 'checkpointing'].includes(activeJob.state));
  const selectedModel = FOUNDRY_MODEL_CATALOG.find((model) => model.id === selectedModelId) ?? FOUNDRY_MODEL_CATALOG[0];

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
        url: selectedModel.download.url,
        expectedSha256: selectedModel.download.expectedSha256,
        expectedSizeBytes: selectedModel.download.approvedMaximumBytes,
        licenseApproved,
      });
      setDownloadStatus(`Verified ${Math.round(result.sizeBytes / 1_000_000)} MB safetensors artifact.`);
      setError(null);
    } catch (caught) {
      setDownloadStatus(null);
      setError(caught instanceof Error ? caught.message : 'Model download failed.');
    }
  };
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
<Card><CardHeader><CardTitle>Approved base models</CardTitle><CardDescription>Review source, immutable revision, license, size, and local resource estimate before selection.</CardDescription></CardHeader><CardContent className="space-y-3">{FOUNDRY_MODEL_CATALOG.map((model) => { const compatibility = modelCompatibility(model, hardware?.ramBytes ?? null); const selected = model.id === selectedModel.id; return <button key={model.id} type="button" aria-pressed={selected} onClick={() => { setSelectedModelId(model.id); setLicenseApproved(false); setDownloadStatus(null); }} className={cn('w-full rounded-lg border p-3 text-left transition-colors', selected ? 'border-cyan-400/50 bg-cyan-500/5' : 'border-border hover:bg-muted/40')}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-ui-strong">{model.name}</span><div className="flex gap-2"><Badge variant="outline">{model.license}</Badge><Badge variant="outline">{compatibility}</Badge></div></div><div className="mt-1 text-metadata text-muted-foreground">{model.publisher} · {model.displaySize} · {model.parameterCount.toLocaleString()} parameters · {model.format}</div><div className="mt-1 truncate text-metadata text-muted-foreground">Revision {model.revision}</div></button>; })}{selectedModel.kind === 'fixture' ? <div className="text-secondary text-emerald-300">Bundled fixture metadata selected. No model download is required.</div> : <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><label className="flex items-start gap-2 text-secondary"><input type="checkbox" checked={licenseApproved} onChange={(event) => setLicenseApproved(event.target.checked)} className="mt-0.5" /><span>I reviewed and approve the {selectedModel.license} license and the {selectedModel.displaySize} verified download.</span></label><div className="flex flex-wrap items-center gap-3"><Button variant="accent" disabled={!licenseApproved || Boolean(downloadStatus?.startsWith('Downloading'))} onClick={() => void downloadSelectedModel()}>Download and verify model</Button>{downloadStatus && <span className="text-metadata text-muted-foreground">{downloadStatus}</span>}</div><p className="text-metadata text-muted-foreground">Remote model code stays disabled. Only the pinned safetensors file is accepted.</p></div>}</CardContent></Card>
{!snapshot.datasetVersion && selectedModel.kind === 'fixture' && <div className="space-y-3"><div className="flex flex-wrap gap-2"><Button variant="accent" onClick={prepare}>Prepare approved fixture inputs</Button><Button variant="outline" onClick={() => setShowDatasetStudio((visible) => !visible)}>{showDatasetStudio ? 'Close Dataset Studio' : 'Open Dataset Studio'}</Button></div>{showDatasetStudio && projectId && <DatasetStudioPanel projectId={projectId} now={dependencies.clock} onVersion={attachStudioDataset} />}</div>}
        {snapshot.datasetVersion && !activeJob && <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4"><div><div className="text-ui-strong">1 approved example</div><div className="text-secondary text-muted-foreground">Fixture Base · Apache-2.0</div></div><Button onClick={startTraining}>Start fixture training</Button></CardContent></Card>}
        {activeJob && <TrainingRegion job={activeJob} active={canAdvance} onAdvance={advance} onResume={resume} />}
        {activeJob?.state === 'completed' && candidate && !evaluation && <Button variant="accent" onClick={evaluate}>Run fixture evaluation</Button>}
        {evaluation && <Card className={evaluation.gate.result === 'pass' ? 'border-emerald-500/30' : 'border-destructive/30'}><CardContent className="flex flex-wrap items-center justify-between gap-4 pt-4"><div><div className="text-ui-strong">{evaluation.gate.result === 'pass' ? 'All gates passed' : 'Promotion blocked'}</div><div className="text-secondary text-muted-foreground">{evaluation.safetyFailures.length} safety failures</div></div>{evaluation.gate.result === 'pass' && !snapshot.championVersionId && <Button variant="accent" onClick={promote}>Promote candidate</Button>}{snapshot.championVersionId && <Badge className="bg-emerald-500/15 text-emerald-300">Current champion</Badge>}</CardContent></Card>}
      </>}
    </div>
  </main>;
}

function TrainingRegion({ job, active, onAdvance, onResume }: { job: TrainingJobSnapshot; active: boolean; onAdvance: () => void; onResume: () => void }) {
  return <Card role="region" aria-label="Training job" className="border-cyan-500/20"><CardContent className="pt-4"><div className="flex items-center justify-between gap-3"><div><div className="text-ui-strong">{titleCase(job.state)}</div><div className="text-secondary text-muted-foreground">{Math.round(job.progress * 100)}% · deterministic fixture worker</div></div>{active && <Button onClick={onAdvance}>Advance fixture job</Button>}{job.state === 'interrupted' && <Button onClick={onResume}>Resume fixture job</Button>}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${job.progress * 100}%` }} /></div>{job.state === 'completed' && <p className="mt-3 text-metadata text-amber-200">Fixture completed: no model training or GPU work occurred.</p>}</CardContent></Card>;
}
