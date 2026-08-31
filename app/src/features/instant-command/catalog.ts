import { NAVIGATION_COMMAND_INPUTS } from './catalog/navigation';
import { TERMINAL_AGENT_COMMAND_INPUTS } from './catalog/terminals';
import { buildCatalogIndex } from './catalogIndex';
import type {
  CatalogMatch,
  CatalogParseResult,
  CommandAvailability,
  CommandDefinition,
  CommandFamily,
  CommandSafety,
  CommandSlotGrammar,
} from './catalogTypes';

type DefinitionInput = Readonly<{
  id: string;
  family: CommandFamily;
  aliases: readonly string[];
  authority: string;
  safety?: CommandSafety;
  availability?: CommandAvailability;
  target?: string;
  example?: string;
  slotGrammar?: CommandSlotGrammar;
  parseSlots?: (match: CatalogMatch, source: string) => CatalogParseResult;
}>;

function command(input: DefinitionInput): CommandDefinition {
  const example = input.example ?? input.aliases[0];
  const slotGrammar = input.slotGrammar ?? 'remainder';
  return Object.freeze({
    id: input.id,
    family: input.family,
    aliases: Object.freeze([...input.aliases]),
    authority: input.authority,
    safety: input.safety ?? 'reversible',
    availability: input.availability ?? 'blocked',
    examples: Object.freeze([example]),
    fixtures: Object.freeze({
      negative: Object.freeze([`tell me about ${example}`]),
      ambiguity: Object.freeze([`${example} for the selected item`]),
      authorization: Object.freeze([`${example} as another account`]),
      latencyBudgetMs: 500,
    }),
    slotGrammar,
    parseSlots: Object.freeze(
      input.parseSlots ??
        ((match: CatalogMatch) =>
          slotGrammar === 'none'
            ? Object.freeze({ status: 'parsed' as const, slots: Object.freeze({}) })
            : Object.freeze({
                status: 'parsed' as const,
                slots: Object.freeze({ remainder: match.remainder }),
              })),
    ),
    ...(input.target ? { target: input.target } : {}),
  });
}

function withCanonicalSlashAlias(input: DefinitionInput): DefinitionInput {
  return Object.freeze({
    ...input,
    aliases: Object.freeze([...input.aliases, `/${input.id.replace(/[._]+/gu, '-')}`]),
  });
}

const MEDIA_TEXT_COMMANDS = new Set(['music.track', 'ambient.set']);
const MEDIA_VOLUME_COMMAND = 'music.volume';

function mediaSlots(match: CatalogMatch): CatalogParseResult {
  const remainder = match.remainder.trim();
  if (match.definition.id === MEDIA_VOLUME_COMMAND) {
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(remainder)) {
      return Object.freeze({ status: 'rejected', reason: 'Provide one numeric music volume.' });
    }
    const value = Number(remainder);
    return Number.isFinite(value)
      ? Object.freeze({ status: 'parsed', slots: Object.freeze({ value }) })
      : Object.freeze({ status: 'rejected', reason: 'Provide one numeric music volume.' });
  }
  if (MEDIA_TEXT_COMMANDS.has(match.definition.id)) {
    if (!remainder || remainder.length > 200 || /[\u0000-\u001f\u007f]/u.test(remainder)) {
      return Object.freeze({ status: 'rejected', reason: 'Name one bounded media track.' });
    }
    return Object.freeze({ status: 'parsed', slots: Object.freeze({ text: remainder }) });
  }
  return remainder
    ? Object.freeze({ status: 'rejected', reason: 'That media command takes no arguments.' })
    : Object.freeze({ status: 'parsed', slots: Object.freeze({}) });
}

function prepareFamilyCommand(input: DefinitionInput): DefinitionInput {
  if (input.family !== 'media') return withCanonicalSlashAlias(input);
  return withCanonicalSlashAlias({
    ...input,
    availability: 'available',
    target: 'ambient audio',
    slotGrammar:
      input.id === MEDIA_VOLUME_COMMAND || MEDIA_TEXT_COMMANDS.has(input.id) ? 'remainder' : 'none',
    parseSlots: mediaSlots,
  });
}

const navigationCommands = NAVIGATION_COMMAND_INPUTS.map((input) =>
  command({ ...input, family: 'navigation' }),
);

const FAMILY_COMMANDS: readonly DefinitionInput[] = [
  {
    id: 'terminal.open',
    family: 'terminal',
    aliases: ['open terminal'],
    authority: 'terminal.queue',
  },
  {
    id: 'terminal.focus',
    family: 'terminal',
    aliases: ['focus terminal'],
    authority: 'terminal.pane',
  },
  {
    id: 'terminal.list',
    family: 'terminal',
    aliases: ['list terminals'],
    authority: 'terminal.snapshot',
    safety: 'read',
  },
  {
    id: 'terminal.status',
    family: 'terminal',
    aliases: ['terminal status'],
    authority: 'terminal.snapshot',
    safety: 'read',
  },
  {
    id: 'terminal.split',
    family: 'terminal',
    aliases: ['split terminal'],
    authority: 'terminal.pane',
  },
  {
    id: 'terminal.rename',
    family: 'terminal',
    aliases: ['rename terminal'],
    authority: 'terminal.pane',
  },
  {
    id: 'terminal.move',
    family: 'terminal',
    aliases: ['move terminal'],
    authority: 'terminal.project-move',
  },
  {
    id: 'terminal.restart',
    family: 'terminal',
    aliases: ['restart terminal'],
    authority: 'terminal.lifecycle',
    safety: 'confirm',
  },
  {
    id: 'terminal.clear',
    family: 'terminal',
    aliases: ['clear terminal'],
    authority: 'terminal.lifecycle',
  },
  {
    id: 'terminal.stop',
    family: 'terminal',
    aliases: ['stop terminal'],
    authority: 'terminal.lifecycle',
    safety: 'confirm',
  },
  {
    id: 'terminal.close',
    family: 'terminal',
    aliases: ['close terminal'],
    authority: 'terminal.lifecycle',
    safety: 'confirm',
  },
  {
    id: 'terminal.cancel_queued',
    family: 'terminal',
    aliases: ['cancel queued command'],
    authority: 'terminal.queue',
  },
  {
    id: 'terminal.message',
    family: 'terminal',
    aliases: ['message terminal', 'tell terminal'],
    authority: 'terminal.prompt-delivery',
  },
  {
    id: 'terminal.broadcast',
    family: 'terminal',
    aliases: ['tell all terminals', 'message all terminals'],
    authority: 'terminal.prompt-delivery',
  },
  { id: 'agent.open', family: 'agent', aliases: ['open agent cli'], authority: 'terminal.queue' },
  { id: 'agent.create', family: 'agent', aliases: ['create agent'], authority: 'agent.registry' },
  {
    id: 'agent.configure',
    family: 'agent',
    aliases: ['configure agent'],
    authority: 'agent.registry',
  },
  {
    id: 'agent.select',
    family: 'agent',
    aliases: ['select agent'],
    authority: 'agent.registry',
    safety: 'read',
  },
  {
    id: 'agent.status',
    family: 'agent',
    aliases: ['agent status'],
    authority: 'agent.registry',
    safety: 'read',
  },
  {
    id: 'agent.stop',
    family: 'agent',
    aliases: ['stop agent'],
    authority: 'terminal.lifecycle',
    safety: 'confirm',
  },
  {
    id: 'project.open',
    family: 'project',
    aliases: ['open project'],
    authority: 'project.registry',
    safety: 'read',
  },
  {
    id: 'project.create',
    family: 'project',
    aliases: ['create project'],
    authority: 'project.registry',
  },
  {
    id: 'project.switch',
    family: 'project',
    aliases: ['switch project'],
    authority: 'project.registry',
  },
  {
    id: 'project.settings',
    family: 'project',
    aliases: ['open project settings'],
    authority: 'project.registry',
    safety: 'read',
  },
  {
    id: 'project.archive',
    family: 'project',
    aliases: ['archive project'],
    authority: 'project.registry',
    safety: 'confirm',
  },
  { id: 'chat.new', family: 'chat', aliases: ['new chat'], authority: 'chat.lifecycle' },
  {
    id: 'chat.open',
    family: 'chat',
    aliases: ['open named chat'],
    authority: 'chat.lifecycle',
    safety: 'read',
  },
  { id: 'chat.rename', family: 'chat', aliases: ['rename chat'], authority: 'chat.lifecycle' },
  {
    id: 'chat.list',
    family: 'chat',
    aliases: ['list chats'],
    authority: 'chat.lifecycle',
    safety: 'read',
  },
  {
    id: 'chat.delete',
    family: 'chat',
    aliases: ['delete chat'],
    authority: 'chat.delete',
    safety: 'confirm',
  },
  {
    id: 'schedule.create',
    family: 'schedule',
    aliases: ['create schedule', 'make schedule'],
    authority: 'schedule.repository',
  },
  {
    id: 'schedule.list',
    family: 'schedule',
    aliases: ['list my schedules'],
    authority: 'schedule.repository',
    safety: 'read',
  },
  {
    id: 'schedule.open',
    family: 'schedule',
    aliases: ['open named schedule'],
    authority: 'schedule.repository',
    safety: 'read',
  },
  {
    id: 'schedule.pause',
    family: 'schedule',
    aliases: ['pause schedule'],
    authority: 'schedule.repository',
  },
  {
    id: 'schedule.resume',
    family: 'schedule',
    aliases: ['resume schedule'],
    authority: 'schedule.repository',
  },
  {
    id: 'schedule.enable',
    family: 'schedule',
    aliases: ['enable schedule'],
    authority: 'schedule.repository',
  },
  {
    id: 'schedule.disable',
    family: 'schedule',
    aliases: ['disable schedule', 'turn off schedule'],
    authority: 'schedule.repository',
  },
  {
    id: 'schedule.run_now',
    family: 'schedule',
    aliases: ['run schedule'],
    authority: 'schedule.runner',
  },
  {
    id: 'schedule.edit',
    family: 'schedule',
    aliases: ['change schedule', 'edit schedule'],
    authority: 'schedule.repository',
  },
  {
    id: 'schedule.delete',
    family: 'schedule',
    aliases: ['delete schedule'],
    authority: 'schedule.repository',
    safety: 'confirm',
  },
  { id: 'timer.start', family: 'schedule', aliases: ['start timer'], authority: 'schedule.timer' },
  {
    id: 'timer.cancel',
    family: 'schedule',
    aliases: ['cancel timer'],
    authority: 'schedule.timer',
  },
  { id: 'alarm.set', family: 'schedule', aliases: ['set alarm'], authority: 'schedule.timer' },
  {
    id: 'alarm.cancel',
    family: 'schedule',
    aliases: ['cancel alarm'],
    authority: 'schedule.timer',
  },
  {
    id: 'setting.read',
    family: 'settings',
    aliases: ['read setting'],
    authority: 'settings.allowlist',
    safety: 'read',
  },
  {
    id: 'setting.set',
    family: 'settings',
    aliases: ['set setting', 'change voice send phrase'],
    authority: 'settings.allowlist',
  },
  {
    id: 'setting.toggle',
    family: 'settings',
    aliases: ['toggle setting', 'turn reduced motion'],
    authority: 'settings.allowlist',
  },
  { id: 'music.play', family: 'media', aliases: ['play music'], authority: 'media.player' },
  { id: 'music.pause', family: 'media', aliases: ['pause music'], authority: 'media.player' },
  { id: 'music.resume', family: 'media', aliases: ['resume music'], authority: 'media.player' },
  { id: 'music.stop', family: 'media', aliases: ['stop music'], authority: 'media.player' },
  { id: 'music.next', family: 'media', aliases: ['next song'], authority: 'media.player' },
  { id: 'music.previous', family: 'media', aliases: ['previous song'], authority: 'media.player' },
  { id: 'music.track', family: 'media', aliases: ['change song'], authority: 'media.player' },
  { id: 'music.volume', family: 'media', aliases: ['set music volume'], authority: 'media.player' },
  { id: 'music.mute', family: 'media', aliases: ['mute music'], authority: 'media.player' },
  { id: 'music.unmute', family: 'media', aliases: ['unmute music'], authority: 'media.player' },
  {
    id: 'ambient.set',
    family: 'media',
    aliases: ['set ambient sound'],
    authority: 'media.ambient',
  },
  {
    id: 'tool.open',
    family: 'tools',
    aliases: ['open tool'],
    authority: 'tool.registry',
    safety: 'read',
  },
  {
    id: 'tool.run',
    family: 'tools',
    aliases: ['run tool'],
    authority: 'tool.gateway',
    safety: 'approval',
  },
  {
    id: 'tool.stop',
    family: 'tools',
    aliases: ['stop tool'],
    authority: 'tool.gateway',
    safety: 'approval',
  },
  {
    id: 'skill.open',
    family: 'tools',
    aliases: ['open skill'],
    authority: 'skill.registry',
    safety: 'read',
  },
  { id: 'skill.enable', family: 'tools', aliases: ['enable skill'], authority: 'skill.registry' },
  { id: 'skill.disable', family: 'tools', aliases: ['disable skill'], authority: 'skill.registry' },
  {
    id: 'plugin.open',
    family: 'tools',
    aliases: ['open plugin'],
    authority: 'plugin.registry',
    safety: 'read',
  },
  {
    id: 'plugin.connect',
    family: 'tools',
    aliases: ['connect plugin'],
    authority: 'plugin.registry',
    safety: 'approval',
  },
  {
    id: 'plugin.disconnect',
    family: 'tools',
    aliases: ['disconnect plugin'],
    authority: 'plugin.registry',
    safety: 'approval',
  },
  {
    id: 'plugin.status',
    family: 'tools',
    aliases: ['show plugin status'],
    authority: 'plugin.registry',
    safety: 'read',
  },
  {
    id: 'files.open',
    family: 'files',
    aliases: ['open file browser'],
    authority: 'files.reader',
    safety: 'read',
  },
  {
    id: 'files.search',
    family: 'files',
    aliases: ['search files'],
    authority: 'files.reader',
    safety: 'read',
  },
  {
    id: 'file.reveal',
    family: 'files',
    aliases: ['reveal file'],
    authority: 'files.reader',
    safety: 'read',
  },
  {
    id: 'file.open',
    family: 'files',
    aliases: ['open file'],
    authority: 'files.reader',
    safety: 'read',
  },
  {
    id: 'context.open',
    family: 'files',
    aliases: ['open context item'],
    authority: 'context.gateway',
    safety: 'read',
  },
  {
    id: 'context.map.create',
    family: 'files',
    aliases: ['create context map'],
    authority: 'context.gateway',
  },
  {
    id: 'context.map.recenter',
    family: 'files',
    aliases: ['recenter context map'],
    authority: 'context.gateway',
  },
  {
    id: 'context.give_terminals',
    family: 'files',
    aliases: ['give context to terminals'],
    authority: 'context.gateway',
    safety: 'approval',
  },
  { id: 'task.create', family: 'tasks', aliases: ['create task'], authority: 'task.repository' },
  {
    id: 'task.open',
    family: 'tasks',
    aliases: ['open task'],
    authority: 'task.repository',
    safety: 'read',
  },
  {
    id: 'task.complete',
    family: 'tasks',
    aliases: ['complete task'],
    authority: 'task.repository',
  },
  { id: 'task.reopen', family: 'tasks', aliases: ['reopen task'], authority: 'task.repository' },
  { id: 'task.assign', family: 'tasks', aliases: ['assign task'], authority: 'task.repository' },
  {
    id: 'workbench.open',
    family: 'workbench',
    aliases: ['open named workbench'],
    authority: 'workbench.registry',
    safety: 'read',
  },
  {
    id: 'workbench.template',
    family: 'workbench',
    aliases: ['apply workbench template'],
    authority: 'workbench.registry',
  },
  {
    id: 'workbench.panel.add',
    family: 'workbench',
    aliases: ['add workbench panel'],
    authority: 'workbench.registry',
  },
  {
    id: 'workbench.wallpaper.set',
    family: 'workbench',
    aliases: ['set workbench wallpaper'],
    authority: 'workbench.registry',
  },
  {
    id: 'workbench.wallpaper.pause',
    family: 'workbench',
    aliases: ['pause workbench wallpaper'],
    authority: 'workbench.registry',
  },
  {
    id: 'workbench.wallpaper.resume',
    family: 'workbench',
    aliases: ['resume workbench wallpaper'],
    authority: 'workbench.registry',
  },
];

const TEAM_COMMANDS = ['connect', 'list', 'message', 'broadcast', 'status'] as const;

const TEAM_ALIASES: Readonly<Record<(typeof TEAM_COMMANDS)[number], readonly string[]>> = {
  connect: ['connect terminals', 'connect team'],
  list: ['list teams'],
  message: ['tell team', 'message team'],
  broadcast: ['broadcast team'],
  status: ['team status'],
};

const teamCommands = TEAM_COMMANDS.map((name) =>
  command({
    id: `team.${name}`,
    family: 'team',
    aliases: [...TEAM_ALIASES[name], `/team-${name}`],
    authority: 'terminal-peer-fabric',
    safety: name === 'list' || name === 'status' ? 'read' : 'approval',
    availability: 'capability-gated',
    example:
      name === 'connect'
        ? 'connect terminals one and two as a team'
        : name === 'message'
          ? 'tell team alpha to run the release audit'
          : `${name.replace('.', ' ')} team alpha`,
  }),
);

export const INSTANT_COMMAND_CATALOG: readonly CommandDefinition[] = Object.freeze([
  ...navigationCommands,
  ...TERMINAL_AGENT_COMMAND_INPUTS.map(command),
  ...FAMILY_COMMANDS.filter(
    (input) =>
      (input.family !== 'terminal' && input.family !== 'agent') ||
      ['terminal.open', 'terminal.message', 'terminal.broadcast', 'agent.open'].includes(input.id),
  )
    .map(prepareFamilyCommand)
    .map(command),
  ...teamCommands,
]);

export const INSTANT_COMMAND_INDEX = buildCatalogIndex(INSTANT_COMMAND_CATALOG);
