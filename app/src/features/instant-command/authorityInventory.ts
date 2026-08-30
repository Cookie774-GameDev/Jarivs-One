export type AuthorityInventoryEntry = Readonly<{
  id: string;
  canonicalSeam: string;
  currentState: 'ready' | 'capability-gated';
}>;

function authority(
  id: string,
  canonicalSeam: string,
  currentState: AuthorityInventoryEntry['currentState'] = 'ready',
): AuthorityInventoryEntry {
  return Object.freeze({ id, canonicalSeam, currentState });
}

export const AUTHORITY_INVENTORY: readonly AuthorityInventoryEntry[] = Object.freeze([
  authority('ui.route', 'navigation route schema and UI store'),
  authority('terminal.queue', 'terminal command queue'),
  authority('terminal.pane', 'terminal pane tree'),
  authority('terminal.snapshot', 'verified live target snapshot'),
  authority('terminal.project-move', 'terminal project move authority'),
  authority('terminal.lifecycle', 'native terminal lifecycle'),
  authority('terminal.prompt-delivery', 'verified terminal prompt delivery'),
  authority('agent.registry', 'agent registry'),
  authority('project.registry', 'project repository'),
  authority('chat.lifecycle', 'chat lifecycle'),
  authority('chat.delete', 'permanent chat deletion authority'),
  authority('schedule.repository', 'Jarvis schedule repository'),
  authority('schedule.runner', 'Jarvis schedule runner'),
  authority('schedule.timer', 'local schedule timer boundary'),
  authority('settings.allowlist', 'typed non-secret preference allowlist'),
  authority('media.player', 'shared music player store'),
  authority('media.ambient', 'ambient audio store'),
  authority('tool.registry', 'first-party and custom tool registry'),
  authority('tool.gateway', 'tool gateway approval boundary'),
  authority('skill.registry', 'skill catalog'),
  authority('plugin.registry', 'plugin connection registry'),
  authority('files.reader', 'bounded files read authority'),
  authority('context.gateway', 'Context Gateway'),
  authority('task.repository', 'task repository'),
  authority('workbench.registry', 'Workbench state authority'),
  authority(
    'terminal-peer-fabric',
    'versioned native Terminal Peer Fabric command port',
    'capability-gated',
  ),
]);
