export const ORIGAMI_USER_MESSAGE_TEXT = 'Hi there how is your day today?';

export const ORIGAMI_ASSISTANT_MESSAGE_TEXT =
  'I’m just a language model, I don’t have personal feelings or experiences like humans do, but I’m always ready to help with any questions or topics you’d like to discuss!\n\nIt sounds like your day may be starting on an interesting note, though. Are you working on something project-related? Or maybe someone in your team has just reported a new incident that you’re interested in investigating?';

export const ORIGAMI_MODEL_LABEL = 'llama3.2:1b';

const clock = 1_735_689_600_000;
const ids = Object.freeze({
  user: 'usr_origami_chat',
  workspace: 'wsp_origami_chat',
  project: 'prj_origami_chat',
  chat: 'cht_origami_chat',
  userMessage: 'msg_origami_user',
  assistantMessage: 'msg_origami_assistant',
  jarvisAgent: 'agt_origami_jarvis',
  writerAgent: 'agt_origami_writer',
  researcherAgent: 'agt_origami_researcher',
  memoryAgent: 'agt_origami_memory_keeper',
});
function agent(id, slug, name, description, capabilities, colorHue) {
  return {
    id,
    slug,
    name,
    description,
    system_prompt: `You are the deterministic ${name} visual-fixture agent.`,
    model: { provider: 'ollama', model: ORIGAMI_MODEL_LABEL },
    tools_allowed: [],
    memory_scope: 'project',
    temperature: 0,
    max_output_tokens: 1024,
    color_hue: colorHue,
    capabilities,
    builtin: true,
    created_at: clock,
    updated_at: clock,
  };
}

const workspace = {
  id: ids.workspace,
  name: 'Workspace',
  owner_id: ids.user,
  created_at: clock,
  updated_at: clock,
};

const project = {
  id: ids.project,
  workspace_id: ids.workspace,
  name: 'Inbox',
  color_hue: 265,
  created_at: clock,
  updated_at: clock,
};

const chat = {
  id: ids.chat,
  workspace_id: ids.workspace,
  project_id: ids.project,
  title: ORIGAMI_USER_MESSAGE_TEXT,
  mode: 'chat',
  active_agent_ids: [ids.jarvisAgent],
  created_at: clock,
  updated_at: clock + 2,
  archived: false,
  pinned: false,
};

const agents = [
  agent(
    ids.jarvisAgent,
    'jarvis',
    'Jarvis',
    'Voice supervisor. Routes intents and decomposes tasks.',
    ['voice_supervision', 'planning'],
    195,
  ),
  agent(ids.writerAgent, 'writer', 'Writer', 'Clear drafting and editing.', ['writing'], 55),
  agent(
    ids.researcherAgent,
    'researcher',
    'Researcher',
    'Evidence-focused research.',
    ['research'],
    190,
  ),
  agent(
    ids.memoryAgent,
    'memory-keeper',
    'Memory Keeper',
    'Maintains durable project context.',
    ['memory_keeping'],
    120,
  ),
];

const messages = [
  {
    id: ids.userMessage,
    chat_id: ids.chat,
    role: 'user',
    parts: [{ kind: 'text', text: ORIGAMI_USER_MESSAGE_TEXT }],
    created_at: clock + 1,
    updated_at: clock + 1,
  },
  {
    id: ids.assistantMessage,
    chat_id: ids.chat,
    role: 'assistant',
    agent_id: ids.jarvisAgent,
    parts: [{ kind: 'text', text: ORIGAMI_ASSISTANT_MESSAGE_TEXT }],
    parent_id: ids.userMessage,
    created_at: clock + 2,
    updated_at: clock + 2,
    usage: {
      input_tokens: 8,
      output_tokens: 79,
      cost_usd: 0,
      provider: 'ollama',
      model: ORIGAMI_MODEL_LABEL,
    },
  },
];

const modelSelection = {
  mode: 'single',
  providerId: 'ollama',
  modelId: ORIGAMI_MODEL_LABEL,
};

const activity = { runs: [], events: [] };

export const ORIGAMI_CHAT_FIXTURE = Object.freeze({
  schemaVersion: 1,
  clock,
  ids,
  workspace,
  project,
  chat,
  messages,
  agents,
  activity,
  modelSelection,
  sessionMetrics: {
    status: 'Idle',
    agentTurns: '',
    doingNow: 'Ready — send a message to start this session',
    values: {
      'Edited files': '0',
      'Lines in/out': '+0 / -0',
      'Tokens in': '0',
      'Tokens out': '0',
      Started: '—',
      Duration: '0ms',
    },
  },
  auth: {
    localUserId: ids.user,
    displayName: 'VibeSpace',
    workspaceId: ids.workspace,
    projectId: ids.project,
    apiKeys: {},
    defaultProvider: 'ollama',
    selectedModels: { ollama: ORIGAMI_MODEL_LABEL },
    offlineMode: true,
    defaultLocalModel: ORIGAMI_MODEL_LABEL,
    plan: 'free',
    voiceAutoListenOnOpen: false,
    stackPreset: 'off',
    stackCustomSteps: [],
    chatModelSelection: modelSelection,
    previousChatModelSelection: { mode: 'none' },
    automaticModelRoutingEnabled: false,
    telemetryOptIn: false,
  },
  ui: {
    navOpen: true,
    inspectorOpen: false,
    activeChatId: ids.chat,
    activeAgentId: null,
    navSectionsCollapsed: {
      workspace: false,
      pinned: false,
      projects: false,
      chats: false,
      agents: false,
      context: true,
      files: true,
    },
    chatMode: 'chat',
    theme: 'vibespace',
    density: 'cozy',
    onboardingComplete: true,
    productTutorialStatus: 'completed',
    lastSeenWhatsNewVersion: '1.5.0',
    ambient: false,
  },
  sidebar: {
    projects: [ids.project],
    chats: [ids.chat],
    agents: [ids.writerAgent, ids.researcherAgent, ids.memoryAgent],
  },
});
