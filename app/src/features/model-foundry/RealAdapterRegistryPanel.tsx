import { Archive, Cpu, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import type { LocalAdapterRecord } from './adapterRegistry';

export function RealAdapterRegistryPanel({ records, runtimeReady, onUse, onProbe, onArchive }: { records: readonly LocalAdapterRecord[]; runtimeReady: boolean; onUse: (record: LocalAdapterRecord) => void; onProbe: (record: LocalAdapterRecord) => void; onArchive: (record: LocalAdapterRecord) => void }) {
  if (!records.length) return null;
  return <Card className="border-emerald-500/25"><CardHeader><CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5 text-emerald-300" /> Local adapter registry</CardTitle><CardDescription>Only checksum-verified local adapter artifacts appear here.</CardDescription></CardHeader><CardContent className="space-y-3">{records.map((record) => <div key={record.jobId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div className="font-mono text-metadata">{record.jobId} · {record.artifactManifestSha256.slice(0, 12)}…</div><div className="flex gap-2"><Button variant="outline" aria-label={`Probe adapter ${record.jobId}`} disabled={!runtimeReady} onClick={() => onProbe(record)}>Probe</Button><Button variant="accent" disabled={!runtimeReady} onClick={() => onUse(record)}>Use in chat</Button><Button variant="outline" aria-label={`Archive adapter ${record.jobId}`} onClick={() => onArchive(record)}><Archive className="h-4 w-4" /></Button></div></div>)}</CardContent></Card>;
}
