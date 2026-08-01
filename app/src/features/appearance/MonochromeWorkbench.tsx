import * as React from 'react';
import {
  Activity,
  Bot,
  Box,
  Braces,
  ChevronDown,
  Command,
  FileCode2,
  Gauge,
  Grid3X3,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast, Toaster } from '@/components/ui/toast';
import { Hint, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  MONOCHROME_WORKBENCH_FIXTURES as fixtures,
  type MonochromeWorkbenchSurfaceId,
} from './monochromeWorkbenchFixtures';

export interface MonochromeWorkbenchRequest {
  readonly devBuild: boolean;
  readonly search: string;
}

export function isMonochromeWorkbenchRequest(request: MonochromeWorkbenchRequest): boolean {
  if (!request.devBuild) return false;
  return new URLSearchParams(request.search).get('monochrome-workbench') === '1';
}

type WorkbenchProps = Partial<MonochromeWorkbenchRequest>;

function Surface({
  id,
  className,
  children,
  ...props
}: {
  id: MonochromeWorkbenchSurfaceId;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'id'>) {
  return (
    <section data-workbench-surface={id} className={className} {...props}>
      {children}
    </section>
  );
}

function RegistrationCross() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-[6px] w-[6px]">
      <span className="absolute left-[2.5px] top-0 h-[6px] w-px bg-accent-cyan" />
      <span className="absolute left-0 top-[2.5px] h-px w-[6px] bg-accent-cyan" />
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-workbench-surface="section-label"
      className="eyebrow mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
    >
      <span aria-hidden="true" className="text-accent-cyan">
        //
      </span>
      {children}
    </div>
  );
}

function StatusDot({ tone }: { tone: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'h-1.5 w-1.5 shrink-0 rounded-full',
        tone === 'teal' && 'bg-accent-cyan',
        tone === 'purple' && 'bg-accent-violet',
        tone === 'amber' && 'bg-warning',
      )}
    />
  );
}

function TopBar() {
  return (
    <Surface
      id="top-bar"
      className="flex h-11 items-center border-b border-border bg-background px-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-6 w-6 place-items-center border border-border-mid bg-panel">
          <Braces className="h-3.5 w-3.5 text-accent-cyan" aria-hidden="true" />
        </span>
        <span className="font-semibold tracking-tight">VIBESPACE</span>
        <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
          {fixtures.workspace.name}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="ghost" size="icon-sm" aria-label="Search workbench">
          <Search aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Open command menu">
          <Command aria-hidden="true" />
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Badge variant="outline" className="rounded-sm font-mono text-[9px]">
          DEV ONLY
        </Badge>
        <Avatar
          data-monochrome-primitive="Avatar"
          aria-label="Synthetic operator avatar"
          seed="synthetic-operator"
          initials="SO"
          size={24}
          style={{
            backgroundColor: 'hsl(var(--accent-cyan))',
            backgroundImage: 'none',
          }}
        />
      </div>
    </Surface>
  );
}

const railItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Runs', icon: Activity },
  { label: 'Contexts', icon: Box },
  { label: 'Canvas', icon: Grid3X3 },
] as const;

function Navigation() {
  return (
    <>
      <Surface
        id="icon-rail"
        className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2"
      >
        {railItems.map(({ label, icon: Icon }, index) => (
          <Button
            key={label}
            variant={index === 0 ? 'outline' : 'ghost'}
            size="icon"
            aria-label={label}
            className={cn('h-8 w-8 rounded-sm', index === 0 && 'border-accent-cyan/40')}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}
        <Button variant="ghost" size="icon" aria-label="Settings" className="mt-auto">
          <Settings2 aria-hidden="true" />
        </Button>
      </Surface>
      <Surface
        id="sidebar"
        className="hidden w-44 shrink-0 border-r border-border bg-panel/40 p-3 md:block"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          Workspace
        </p>
        <nav aria-label="Workbench sections" className="mt-3 space-y-1">
          {fixtures.navigation.map((item, index) => (
            <button
              key={item}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs',
                index === 0
                  ? 'border border-border-mid bg-elevated text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span className="font-mono text-[9px] text-ink-faint">0{index + 1}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-3">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <StatusDot tone="teal" />
            {fixtures.workspace.runtime}
          </div>
          <p className="mt-1 truncate font-mono text-[9px] text-ink-faint">
            {fixtures.workspace.branch}
          </p>
        </div>
      </Surface>
    </>
  );
}

function DashboardOverview() {
  return (
    <div className="grid gap-3 xl:grid-cols-[1.4fr_0.6fr]">
      <div className="space-y-3">
        <Surface id="metrics" className="grid gap-px bg-border sm:grid-cols-3">
          {fixtures.metrics.map((metric, index) => (
            <Card
              key={metric.label}
              data-monochrome-primitive={index === 0 ? 'Card' : undefined}
              data-workbench-state={index === 0 ? 'default selected' : 'default'}
              className="relative rounded-sm border-0 bg-panel"
            >
              {index === 0 && <RegistrationCross />}
              <CardHeader className="p-3 pb-1">
                <p className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground">
                  {metric.label}
                </p>
              </CardHeader>
              <CardContent className="flex items-end justify-between p-3 pt-0">
                <span className="font-mono text-xl font-semibold tabular-nums">{metric.value}</span>
                <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
                  <StatusDot tone={metric.tone} />
                  {metric.delta}
                </span>
              </CardContent>
            </Card>
          ))}
        </Surface>

        <Surface id="chart" className="relative border border-border bg-panel p-3">
          <RegistrationCross />
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-medium">Run throughput</p>
              <p className="font-mono text-[9px] text-muted-foreground">
                SYNTHETIC / LAST 12 SLOTS
              </p>
            </div>
            <Badge variant="outline" className="rounded-sm">
              91 peak
            </Badge>
          </div>
          <div
            className="flex h-28 items-end gap-1 border-b border-l border-border px-2 pt-2"
            role="img"
            aria-label="Synthetic run throughput chart, peaking at 91"
          >
            {fixtures.chartSegments.map((height, index) => (
              <span
                key={`${height}-${index}`}
                className={cn(
                  'min-w-1 flex-1 border-t',
                  index > 8
                    ? 'border-accent-violet bg-accent-violet/25'
                    : 'border-accent-cyan bg-accent-cyan/20',
                )}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </Surface>

        <Surface id="table" className="overflow-hidden border border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-medium">Agent activity</span>
            <Button variant="ghost" size="icon-sm" aria-label="Agent activity options">
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table
              aria-label="Synthetic agent activity"
              className="w-full min-w-[520px] text-left text-xs"
            >
              <thead className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-normal">Run</th>
                  <th className="px-3 py-2 font-normal">Agent</th>
                  <th className="px-3 py-2 font-normal">Task</th>
                  <th className="px-3 py-2 font-normal">State</th>
                  <th className="px-3 py-2 text-right font-normal">Time</th>
                </tr>
              </thead>
              <tbody>
                {fixtures.activityRows.map((row) => (
                  <tr key={row.id} className="border-b border-line-soft last:border-0">
                    <td className="px-3 py-2 font-mono text-[10px]">{row.id}</td>
                    <td className="px-3 py-2">{row.agent}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.task}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot tone={row.status === 'Review' ? 'amber' : 'teal'} />
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[10px]">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      </div>

      <div className="space-y-3">
        <Surface id="pricing" className="border border-border bg-panel p-3">
          <SectionLabel>Runtime plans</SectionLabel>
          <div className="space-y-2">
            {fixtures.plans.map((plan, index) => (
              <div
                key={plan.name}
                className={cn(
                  'border p-3',
                  index === 1 ? 'border-accent-violet/50 bg-accent-violet/5' : 'border-border',
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{plan.name}</span>
                  <span className="font-mono text-lg">{plan.price}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{plan.detail}</p>
              </div>
            ))}
          </div>
        </Surface>

        <Surface id="numbered-setup" className="border border-border bg-panel p-3">
          <SectionLabel>Setup sequence</SectionLabel>
          <ol className="space-y-3">
            {fixtures.setupSteps.map((step) => (
              <li key={step.number} className="grid grid-cols-[24px_1fr] gap-2">
                <span className="font-mono text-[10px] text-accent-cyan">{step.number}</span>
                <span>
                  <span className="block text-xs font-medium">{step.label}</span>
                  <span className="block text-[10px] text-muted-foreground">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </Surface>
      </div>
    </div>
  );
}

function ControlsAndForm() {
  const [environment, setEnvironment] = React.useState('Local runtime');
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Surface id="form" className="border border-border bg-panel p-3">
        <SectionLabel>Prompt run</SectionLabel>
        <form aria-label="Prompt run configuration" className="space-y-3">
          <div>
            <Label data-monochrome-primitive="Label" htmlFor="run-name">
              Run name
            </Label>
            <Input
              data-monochrome-primitive="Input"
              data-workbench-state="validation-error focus-visible screen-reader"
              id="run-name"
              aria-invalid="true"
              aria-describedby="run-name-error"
              defaultValue="QA"
              className="mt-1 border-destructive"
            />
            <p id="run-name-error" className="mt-1 text-[10px] text-destructive">
              Use at least three characters.
            </p>
          </div>
          <div>
            <Label htmlFor="prompt-body">Prompt</Label>
            <Textarea
              data-monochrome-primitive="Textarea"
              id="prompt-body"
              defaultValue={fixtures.prompt.body}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="runtime-select">Runtime</Label>
            <select
              id="runtime-select"
              className="mt-1 w-full rounded-sm border border-input bg-background px-2 text-xs"
              defaultValue="local"
            >
              <option value="local">Local runtime</option>
              <option value="isolated">Isolated preview</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="local-runtime" name="runtime" type="radio" defaultChecked />
            <Label htmlFor="local-runtime">Local runtime</Label>
          </div>
          <div>
            <Label htmlFor="detail-slider">Response detail</Label>
            <input
              id="detail-slider"
              type="range"
              min="1"
              max="5"
              defaultValue="3"
              className="mt-1 w-full accent-[hsl(var(--accent-cyan))]"
            />
          </div>
          <Button
            data-monochrome-primitive="Button"
            data-workbench-state="default hover active focus-visible keyboard"
            type="button"
            onClick={() => toast.success('Fixture published', 'Synthetic state is ready.', 0)}
            aria-label="Publish fixture"
          >
            <Send aria-hidden="true" />
            Publish fixture
          </Button>
        </form>
      </Surface>

      <Surface id="control-states" className="border border-border bg-panel p-3">
        <SectionLabel>Control states</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                data-monochrome-primitive="Checkbox"
                data-workbench-state="checked keyboard screen-reader"
                id="include-context"
              />
              <Label htmlFor="include-context">Include repository context</Label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="deterministic-mode">Deterministic mode</Label>
              <Switch
                data-monochrome-primitive="Switch"
                data-workbench-state="checked focus-visible"
                id="deterministic-mode"
                defaultChecked
                aria-label="Deterministic mode"
                className="[&>span]:shadow-none"
              />
            </div>
            <Button
              data-workbench-state="disabled loading"
              type="button"
              disabled
              aria-label="Syncing fixture"
              className="w-full"
            >
              <span
                className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                aria-hidden="true"
              />
              Syncing fixture
            </Button>
            <Button
              data-workbench-state="destructive"
              variant="destructive"
              type="button"
              aria-label="Delete synthetic run"
              className="w-full"
            >
              <Trash2 aria-hidden="true" />
              Delete synthetic run
            </Button>
          </div>
          <div className="space-y-3">
            <div data-workbench-surface="dropdown" className="relative">
              <Button
                variant="outline"
                type="button"
                aria-label="Open environment menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="w-full justify-between"
              >
                {environment}
                <ChevronDown aria-hidden="true" />
              </Button>
              {menuOpen && (
                <div
                  data-workbench-state="open"
                  role="menu"
                  aria-label="Environment menu"
                  className="absolute left-0 top-9 z-20 w-full border border-border-mid bg-elevated p-1"
                >
                  {['Local runtime', 'Staging cluster'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setEnvironment(item);
                        setMenuOpen(false);
                      }}
                      className="block w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">Environment: {environment}</p>
            </div>
            <div data-monochrome-primitive="Popover">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" type="button" className="w-full">
                    <FileCode2 aria-hidden="true" />
                    Inspect runtime notes
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="rounded-sm text-xs">
                  This popover contains synthetic runtime notes only.
                </PopoverContent>
              </Popover>
            </div>
            <div data-workbench-surface="tooltip" data-monochrome-primitive="Tooltip">
              <Hint label="Runs without external requests" hotkey="Ctrl+R">
                <Button variant="outline" type="button" className="w-full">
                  <Gauge aria-hidden="true" />
                  Verification hint
                </Button>
              </Hint>
            </div>
            <Skeleton
              data-monochrome-primitive="Skeleton"
              data-workbench-state="loading screen-reader"
              role="status"
              aria-label="Loading synthetic result"
              className="h-8 w-full rounded-sm"
              style={{
                backgroundColor: 'hsl(var(--muted))',
                backgroundImage: 'none',
              }}
            />
          </div>
        </div>
      </Surface>
    </div>
  );
}

function ProductSurfaces() {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Surface id="jarvis" className="border border-border bg-panel">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Bot className="h-4 w-4 text-accent-cyan" aria-hidden="true" />
          <span className="font-medium">JARVIS</span>
          <Badge variant="success" className="ml-auto rounded-sm">
            ONLINE
          </Badge>
        </div>
        <div className="space-y-2 p-3">
          {fixtures.jarvisMessages.map((message) => (
            <div
              key={message.role}
              className={cn(
                'border-l px-2 py-1 text-[11px]',
                message.role === 'jarvis'
                  ? 'border-accent-cyan text-foreground'
                  : 'border-border-mid text-muted-foreground',
              )}
            >
              <span className="block font-mono text-[8px] uppercase text-ink-faint">
                {message.role}
              </span>
              {message.text}
            </div>
          ))}
        </div>
      </Surface>

      <Surface id="prompt-forge" className="border border-border bg-panel p-3">
        <div className="flex items-center gap-2">
          <WandSparkles className="h-4 w-4 text-accent-violet" aria-hidden="true" />
          <span className="font-medium">Prompt Forge</span>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">V.04</span>
        </div>
        <p className="mt-3 text-sm font-medium">{fixtures.prompt.title}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {fixtures.prompt.body}
        </p>
        <Button variant="outline" size="sm" type="button" className="mt-3">
          <Sparkles aria-hidden="true" />
          Refine prompt
        </Button>
      </Surface>

      <Surface id="context-inspector" className="border border-border bg-panel p-3">
        <div className="flex items-center gap-2">
          <Braces className="h-4 w-4 text-warning" aria-hidden="true" />
          <span className="font-medium">Context inspector</span>
        </div>
        <div className="mt-3 space-y-2">
          {fixtures.contexts.map((context) => (
            <div key={context.label} className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">{context.label}</span>
              <span className="font-mono">{context.tokens}</span>
            </div>
          ))}
          <div
            role="progressbar"
            aria-label="Context budget"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={64}
            className="h-1.5 border border-border bg-background"
          >
            <div className="h-full w-[64%] bg-accent-violet" />
          </div>
        </div>
      </Surface>
    </div>
  );
}

function TabbedWorkspace() {
  return (
    <Surface
      id="tabs"
      data-monochrome-primitive="Tabs"
      className="border border-border bg-panel p-3"
    >
      <Tabs defaultValue="terminal">
        <TabsList className="rounded-sm">
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="canvas">Canvas</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
          <TabsTrigger value="disabled" disabled>
            Disabled
          </TabsTrigger>
        </TabsList>
        <TabsContent
          data-workbench-state="selected active"
          value="terminal"
          className="grid gap-3 lg:grid-cols-[1fr_220px]"
        >
          <Surface id="terminal-tab" className="min-h-36 border border-border bg-background p-3">
            <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
              <Terminal className="h-3.5 w-3.5 text-accent-cyan" aria-hidden="true" />
              <span className="font-mono text-[10px]">fixture-shell</span>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            </div>
            <pre className="space-y-1 whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
              {fixtures.terminalLines.map((line, index) => (
                <span
                  key={line}
                  className={cn('block', index > 0 ? 'text-muted-foreground' : 'text-foreground')}
                >
                  {line}
                </span>
              ))}
            </pre>
          </Surface>
          <Surface id="access-panel" className="border border-border bg-elevated p-3">
            <LockKeyhole className="h-4 w-4 text-warning" aria-hidden="true" />
            <p className="mt-2 font-medium">Scoped access</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Fixture mode blocks account and network data.
            </p>
            <Button variant="outline" size="sm" type="button" className="mt-3 w-full">
              <ShieldCheck aria-hidden="true" />
              View policy
            </Button>
          </Surface>
        </TabsContent>
        <TabsContent value="canvas" forceMount>
          <Surface
            id="canvas-toolbar"
            className="flex min-h-36 items-start gap-1 border border-border p-2"
          >
            <Button variant="outline" size="icon-sm" aria-label="Add canvas node">
              <Plus aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Run canvas">
              <Play aria-hidden="true" />
            </Button>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Button variant="ghost" size="icon-sm" aria-label="Open canvas tools">
              <Grid3X3 aria-hidden="true" />
            </Button>
          </Surface>
        </TabsContent>
        <TabsContent value="access">
          <div className="min-h-36 border border-border p-3 text-xs">Access state comparison</div>
        </TabsContent>
        <TabsContent value="disabled" />
      </Tabs>
    </Surface>
  );
}

function FeedbackStates() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Surface id="badges" className="border border-border bg-panel p-3">
        <SectionLabel>Badges</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          <Badge data-monochrome-primitive="Badge" variant="success">
            READY
          </Badge>
          <Badge variant="warning">REVIEW</Badge>
          <Badge variant="destructive">BLOCKED</Badge>
          <Badge variant="outline">LOCAL</Badge>
        </div>
      </Surface>
      <Surface id="empty-state" className="border border-border bg-panel p-3 text-center">
        <Box className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-xs font-medium">No pinned contexts</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Pin a synthetic context to compare it.
        </p>
      </Surface>
      <div data-monochrome-primitive="Separator" className="border border-border bg-panel p-3">
        <SectionLabel>Fixture boundary</SectionLabel>
        <Separator decorative={false} aria-label="Fixture boundary" />
        <p className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          Synthetic fixtures only
        </p>
      </div>
    </div>
  );
}

function Overlays() {
  return (
    <div className="flex flex-wrap gap-2">
      <div
        data-workbench-surface="dialog"
        data-monochrome-primitive="Dialog"
        data-workbench-state="open"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" type="button" aria-label="Review access policy">
              <LockKeyhole aria-hidden="true" />
              Review access policy
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm">
            <DialogHeader>
              <DialogTitle>Review access policy</DialogTitle>
              <DialogDescription>
                This development fixture never reads accounts or network responses.
              </DialogDescription>
            </DialogHeader>
            <div className="border border-border bg-background p-3 text-xs">
              Allowed: static synthetic fixture data.
            </div>
            <DialogFooter>
              <Button variant="outline" type="button">
                Keep isolated
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div data-workbench-surface="toast" data-monochrome-primitive="Toast">
        <span className="sr-only" data-workbench-state="screen-reader">
          Toast notifications are announced when published.
        </span>
        <Toaster />
      </div>
    </div>
  );
}

export function MonochromeWorkbench({
  devBuild = import.meta.env.DEV,
  search = typeof window === 'undefined' ? '' : window.location.search,
}: WorkbenchProps) {
  if (!isMonochromeWorkbenchRequest({ devBuild, search })) return null;

  return (
    <TooltipProvider>
      <div
        data-monochrome-development-surface="true"
        data-workbench-state="default"
        className="min-h-screen bg-background font-sans text-xs text-foreground"
      >
        <TopBar />
        <div className="flex min-h-[calc(100vh-44px)]">
          <Navigation />
          <main className="min-w-0 flex-1 overflow-auto p-3 sm:p-4">
            <div className="mx-auto max-w-[1320px] space-y-3">
              <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent-cyan">
                    APPEARANCE / MC4
                  </p>
                  <h1 className="mt-1 text-lg font-semibold tracking-tight">
                    MonoChrome primitive workbench
                  </h1>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Deterministic component states · no account or network data
                  </p>
                </div>
                <Overlays />
              </header>
              <DashboardOverview />
              <ControlsAndForm />
              <ProductSurfaces />
              <TabbedWorkspace />
              <FeedbackStates />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
