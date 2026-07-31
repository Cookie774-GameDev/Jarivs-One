import * as React from 'react';
import {
  Bot,
  Command,
  CreditCard,
  FileText,
  Gauge,
  MessageCircle,
  Network,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Hint,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toaster,
  toast,
  TooltipProvider,
} from '@/components/ui';
import { SakuraBackdropView } from './SakuraBackdrop';

export interface SakuraStyleBoardRequest {
  readonly devBuild: boolean;
  readonly search: string;
}

export function isSakuraStyleBoardRequest(request: SakuraStyleBoardRequest): boolean {
  if (!request.devBuild) return false;
  return new URLSearchParams(request.search).get('sakura-style-board') === '1';
}

type SakuraStyleBoardFixtureProps = Partial<SakuraStyleBoardRequest>;

function Surface({
  id,
  className = '',
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-sakura-surface={id}
      className={`rounded-[var(--sakura-radius-panel)] border border-border bg-panel p-4 shadow-[var(--shadow-soft)] ${className}`}
    >
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      <span className="h-px w-5 bg-accent" aria-hidden="true" />
      {children}
    </div>
  );
}

function NavigationStudy() {
  const items = [
    [MessageCircle, 'Chat', '3'],
    [Network, 'Context', '12'],
    [SquareTerminal, 'Terminals', '4'],
    [Sparkles, 'Canvas', ''],
  ] as const;

  return (
    <Surface id="navigation" className="min-h-[420px] p-3">
      <div className="mb-5 flex items-center gap-2 px-2">
        <div className="grid h-8 w-8 place-items-center rounded-full border border-accent/40 bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="font-display text-base font-semibold">VibeSpace</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Sakura study
          </div>
        </div>
      </div>
      <SectionLabel>Workspace</SectionLabel>
      <nav aria-label="Sakura fixture navigation" className="space-y-1">
        {items.map(([Icon, label, count], index) => (
          <button
            key={label}
            type="button"
            aria-current={index === 0 ? 'page' : undefined}
            className={`flex w-full items-center gap-2 rounded-[var(--sakura-radius-control)] border px-3 py-2 text-left text-sm transition-colors ${
              index === 0
                ? 'border-accent/45 bg-accent/18 text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {count ? <span className="text-[10px]">{count}</span> : null}
          </button>
        ))}
      </nav>
      <Separator className="my-5" />
      <SectionLabel>Agents</SectionLabel>
      <div className="space-y-3 px-2 text-sm">
        {[
          ['J', 'Jarvis', 'online'],
          ['A', 'Architect', 'ready'],
          ['R', 'Researcher', 'idle'],
        ].map(([initials, name, state]) => (
          <div key={name} className="flex items-center gap-2">
            <Avatar seed={name} initials={initials} size={26} />
            <span className="flex-1">{name}</span>
            <span className="text-[10px] text-muted-foreground">{state}</span>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function ConversationStudy() {
  return (
    <div className="space-y-4">
      <Surface id="chat" className="relative overflow-hidden p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <SectionLabel>Quiet creative space</SectionLabel>
            <h2 className="font-display text-3xl leading-tight">
              Plan with calm, ship with clarity.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              A fixture-backed workspace for every model, agent, voice, and task.
            </p>
          </div>
          <Badge variant="accent">Sakura active</Badge>
        </div>
        <div className="space-y-3">
          <article className="mr-12 rounded-[var(--sakura-radius-panel)] border border-border bg-elevated p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <Avatar seed="Jarvis" initials="J" size={24} />
              Jarvis
              <span className="font-normal text-muted-foreground">just now</span>
            </div>
            <p className="text-sm leading-6 text-foreground/90">
              The workspace is quiet and ready. I can shape a launch plan, gather context, or
              coordinate your agents.
            </p>
          </article>
          <article className="ml-16 rounded-[var(--sakura-radius-panel)] border border-accent/35 bg-accent/12 p-4">
            <div className="mb-1 text-xs font-semibold">You</div>
            <p className="text-sm leading-6">Turn this launch into a calm three-day sprint.</p>
          </article>
        </div>
        <div className="mt-5 flex items-end gap-2 rounded-[var(--sakura-radius-panel)] border border-border bg-background/70 p-2">
          <Textarea
            aria-label="Message Jarvis"
            placeholder="Ask Jarvis anything…"
            className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button aria-label="Send fixture message" size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-3">
        <Surface id="jarvis">
          <SectionLabel>Jarvis</SectionLabel>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-accent/16 text-accent">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Planning</div>
              <div className="text-xs text-muted-foreground">3 actions ready</div>
            </div>
          </div>
        </Surface>
        <Surface id="terminal">
          <SectionLabel>Terminal</SectionLabel>
          <div className="rounded-md bg-background/80 p-3 font-mono text-xs">
            <span className="text-success">●</span> pr-30 / focused checks
            <br />
            <span className="text-muted-foreground">$</span> npm test
          </div>
        </Surface>
        <Surface id="context">
          <SectionLabel>Context</SectionLabel>
          <div className="flex items-center gap-2 text-sm">
            <Network className="h-4 w-4 text-accent" />
            <span className="flex-1">Launch knowledge map</span>
            <Badge variant="outline">12 nodes</Badge>
          </div>
        </Surface>
      </div>

      <Surface id="canvas-toolbar" className="flex flex-wrap items-center gap-2">
        <SectionLabel>Canvas toolbar</SectionLabel>
        <Button variant="secondary" size="sm">
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          New thought
        </Button>
        <Button variant="ghost" size="sm">
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          Note
        </Button>
        <Badge variant="secondary">100% zoom</Badge>
      </Surface>
    </div>
  );
}

function AccountStudy() {
  return (
    <div className="space-y-4">
      <Surface id="usage">
        <SectionLabel>Usage</SectionLabel>
        <div className="mb-2 flex items-end justify-between">
          <span className="font-display text-2xl">68%</span>
          <Gauge className="h-5 w-5 text-accent" />
        </div>
        <div
          role="progressbar"
          aria-label="Synthetic monthly usage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={68}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-[68%] rounded-full bg-accent" />
        </div>
      </Surface>
      <Surface id="billing">
        <SectionLabel>Billing</SectionLabel>
        <div className="mb-3 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-warning" />
          <div>
            <div className="font-semibold">VibeSpace Pro</div>
            <div className="text-xs text-muted-foreground">Renews August 31</div>
          </div>
        </div>
        <Button variant="secondary" className="w-full">
          Manage plan
        </Button>
      </Surface>
      <Surface id="access-lock">
        <SectionLabel>Access</SectionLabel>
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-success/12 text-success">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold">Workspace protected</div>
            <div className="text-xs text-muted-foreground">Account isolation active</div>
          </div>
        </div>
        <Button variant="outline" className="w-full">
          Review access
        </Button>
      </Surface>
    </div>
  );
}

function PrimitiveStudy() {
  const [checked, setChecked] = React.useState(true);
  const [enabled, setEnabled] = React.useState(true);

  return (
    <Surface id="primitives" className="mt-4">
      <SectionLabel>Shared primitive states</SectionLabel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card data-sakura-primitive="Card" data-sakura-state="default selected">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Avatar
                data-sakura-primitive="Avatar"
                seed="Sakura operator"
                initials="SO"
                size={30}
              />
              <div>
                <div className="text-sm font-semibold">Operator</div>
                <Badge data-sakura-primitive="Badge" variant="success">
                  Ready
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              data-sakura-primitive="Button"
              data-sakura-state="hover focus-visible active"
              aria-pressed="true"
              className="w-full ring-2 ring-ring ring-offset-2 ring-offset-background"
            >
              Run focused check
            </Button>
            <Skeleton
              data-sakura-primitive="Skeleton"
              data-sakura-state="loading"
              role="status"
              aria-label="Loading synthetic result"
              className="h-2 w-3/4"
            />
          </CardContent>
        </Card>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <Label data-sakura-primitive="Label" htmlFor="sakura-run-name">
            Run name
          </Label>
          <Input
            data-sakura-primitive="Input"
            data-sakura-state="validation-error"
            id="sakura-run-name"
            defaultValue="QA"
            aria-invalid="true"
            aria-describedby="sakura-run-name-error"
            className="border-destructive"
          />
          <p id="sakura-run-name-error" role="alert" className="text-xs text-destructive">
            Use at least three characters.
          </p>
          <Textarea
            data-sakura-primitive="Textarea"
            aria-label="Fixture notes"
            defaultValue="Preserve behavior. Refine the surface."
          />
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              data-sakura-primitive="Checkbox"
              data-sakura-state="selected"
              checked={checked}
              onCheckedChange={(value) => setChecked(value === true)}
            />
            Include project context
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            Calm motion
            <Switch
              data-sakura-primitive="Switch"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Calm motion"
            />
          </label>
          <Separator data-sakura-primitive="Separator" />
          <div className="flex flex-wrap gap-2">
            <Popover>
              <div data-sakura-primitive="Popover" data-sakura-state="open">
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    Environment
                  </Button>
                </PopoverTrigger>
                <span className="sr-only">Open state represented</span>
              </div>
              <PopoverContent className="w-52 text-sm">Local fixture only.</PopoverContent>
            </Popover>
            <TooltipProvider>
              <div data-sakura-primitive="Tooltip">
                <Hint label="Open command palette" hotkey="Ctrl+K">
                  <Button variant="ghost" size="icon" aria-label="Command palette hint">
                    <Command className="h-4 w-4" />
                  </Button>
                </Hint>
              </div>
            </TooltipProvider>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <Tabs data-sakura-primitive="Tabs" data-sakura-state="selected" defaultValue="chat">
            <TabsList className="w-full">
              <TabsTrigger className="flex-1" value="chat">
                Chat
              </TabsTrigger>
              <TabsTrigger className="flex-1" value="terminal">
                Terminal
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="text-sm text-muted-foreground">
              Real shared tab semantics.
            </TabsContent>
            <TabsContent value="terminal" className="font-mono text-xs">
              $ focused-check
            </TabsContent>
          </Tabs>
          <Dialog>
            <div data-sakura-primitive="Dialog">
              <DialogTrigger asChild>
                <Button variant="secondary" className="w-full">
                  Review fixture
                </Button>
              </DialogTrigger>
            </div>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Review Sakura fixture</DialogTitle>
                <DialogDescription>
                  This development-only surface never enters production navigation.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Looks good</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div data-sakura-primitive="Toast">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => toast.success('Fixture checked', 'Shared states remain intact.')}
            >
              Show toast
            </Button>
          </div>
          <Button
            data-sakura-state="disabled loading"
            disabled
            aria-busy="true"
            aria-label="Syncing fixture"
            className="w-full"
          >
            <span
              aria-hidden="true"
              className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
            />
            Syncing fixture
          </Button>
        </div>
      </div>
    </Surface>
  );
}

export function SakuraStyleBoardFixture({
  devBuild = import.meta.env.DEV,
  search = window.location.search,
}: SakuraStyleBoardFixtureProps) {
  if (!isSakuraStyleBoardRequest({ devBuild, search })) return null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <SakuraBackdropView intensity="open" paused rendering="static" />
      <div
        data-sakura-surface="shell"
        className="relative z-10 mx-auto min-h-screen max-w-[1600px] border-x border-border bg-background/45"
      >
        <header
          data-sakura-surface="top-bar"
          className="flex h-14 items-center gap-3 border-b border-border bg-panel px-4"
        >
          <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
          <h1 className="font-display text-lg font-semibold">Sakura shared interface study</h1>
          <Badge variant="outline">Development only</Badge>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background/55 px-3 py-1.5 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              Search or run a command
            </div>
            <Button variant="ghost" size="icon" aria-label="Fixture settings">
              <Settings2 className="h-4 w-4" />
            </Button>
            <Avatar seed="VibeSpace" initials="VS" size={30} />
          </div>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
          <NavigationStudy />
          <ConversationStudy />
          <AccountStudy />
        </div>
        <div className="px-4 pb-4">
          <PrimitiveStudy />
        </div>
      </div>
      <Toaster />
    </main>
  );
}
