import { Archive, Cpu, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import type { LocalAdapterRecord } from './adapterRegistry';

export function RealAdapterRegistryPanel({ records, onUse, onArchive }: { records: readonly LocalAdapterRecord[]; onUse: (record: LocalAdapterRecord) => void; onArchive: (record: LocalAdapterRecord) => void }) {
  if (!records.length) return null;
  return <Card className="border-emerald-500/25"><CardHeader><CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5 text-emerald-300" /> Local adapter registry</CardTitle><CardDescription>Only checksum-verified local adapter artifacts appear here. Candidates remain separate from fixture promotion evidence.</CardDescription></CardHeader><CardContent className="space-y-3">{records.map((record) => <div key={record.jobId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3"><div><div className="flex items-center gap-2 text-ui-strong"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Candidate adapter</div><div className="mt-1 font-mono text-metadata text-muted-foreground">{record.jobId} · {record.artifactManifestSha256.slice(0, 12)}… · {record.adapterFileCount} files</div></div><div className="flex gap-2">{record.status === 'candidate' && <Button variant="accent" onClick={() => onUse(record)}>Use in chat</Button>}{record.status === 'candidate' && <Button variant="outline" onClick={() => onArchive(record)}><Archive className="h-4 w-4" /> Archive</Button>}</div></div>)}</CardContent></Card>;
}
