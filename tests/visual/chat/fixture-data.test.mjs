import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ORIGAMI_ASSISTANT_MESSAGE_TEXT,
  ORIGAMI_CHAT_FIXTURE,
  ORIGAMI_MODEL_LABEL,
  ORIGAMI_USER_MESSAGE_TEXT,
} from './fixture-data.mjs';

test('fixture has fixed identifiers, timestamps, and one exact user/assistant turn', () => {
  assert.equal(ORIGAMI_CHAT_FIXTURE.clock, 1_735_689_600_000);
  assert.deepEqual(ORIGAMI_CHAT_FIXTURE.ids, {
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
  assert.equal(ORIGAMI_USER_MESSAGE_TEXT, 'Hi there how is your day today?');
  assert.equal(
    ORIGAMI_ASSISTANT_MESSAGE_TEXT,
    'I’m just a language model, I don’t have personal feelings or experiences like humans do, but I’m always ready to help with any questions or topics you’d like to discuss!\n\nIt sounds like your day may be starting on an interesting note, though. Are you working on something project-related? Or maybe someone in your team has just reported a new incident that you’re interested in investigating?',
  );
  assert.equal(ORIGAMI_MODEL_LABEL, 'llama3.2:1b');
  assert.deepEqual(
    ORIGAMI_CHAT_FIXTURE.messages.map(({ role, parts }) => [role, parts[0].text]),
    [
      ['user', ORIGAMI_USER_MESSAGE_TEXT],
      ['assistant', ORIGAMI_ASSISTANT_MESSAGE_TEXT],
    ],
  );
});

test('fixture rows are JSON-safe and referentially intact', () => {
  const roundTrip = JSON.parse(JSON.stringify(ORIGAMI_CHAT_FIXTURE));
  assert.deepEqual(roundTrip, ORIGAMI_CHAT_FIXTURE);
  assert.equal(roundTrip.workspace.owner_id, roundTrip.ids.user);
  assert.equal(roundTrip.project.workspace_id, roundTrip.workspace.id);
  assert.equal(roundTrip.chat.workspace_id, roundTrip.workspace.id);
  assert.equal(roundTrip.chat.project_id, roundTrip.project.id);
  assert.equal(roundTrip.messages[0].chat_id, roundTrip.chat.id);
  assert.equal(roundTrip.messages[1].chat_id, roundTrip.chat.id);
  assert.equal(roundTrip.messages[1].parent_id, roundTrip.messages[0].id);
  assert.equal(roundTrip.messages[1].agent_id, roundTrip.ids.jarvisAgent);
  assert.ok(roundTrip.agents.some(({ id }) => id === roundTrip.ids.jarvisAgent));
});

test('fixture contains no secret, cloud-session, or external-network state', () => {
  const serialized = JSON.stringify(ORIGAMI_CHAT_FIXTURE);
  assert.doesNotMatch(serialized, /cloudSession|sk-[a-z0-9]|AIza|https?:\/\//i);
  assert.deepEqual(ORIGAMI_CHAT_FIXTURE.auth.apiKeys, {});
  assert.equal(ORIGAMI_CHAT_FIXTURE.auth.cloudSession, undefined);
  assert.equal(ORIGAMI_CHAT_FIXTURE.modelSelection.mode, 'single');
  assert.equal(ORIGAMI_CHAT_FIXTURE.modelSelection.providerId, 'ollama');
  assert.equal(ORIGAMI_CHAT_FIXTURE.modelSelection.modelId, ORIGAMI_MODEL_LABEL);
});

test('fixture suppresses the production release-notes overlay with the current version', () => {
  assert.equal(ORIGAMI_CHAT_FIXTURE.ui.lastSeenWhatsNewVersion, '1.5.0');
});

test('fixture supplies deterministic sidebar records backed by live rows', () => {
  assert.deepEqual(ORIGAMI_CHAT_FIXTURE.sidebar.projects, [ORIGAMI_CHAT_FIXTURE.project.id]);
  assert.deepEqual(ORIGAMI_CHAT_FIXTURE.sidebar.chats, [ORIGAMI_CHAT_FIXTURE.chat.id]);
  assert.deepEqual(ORIGAMI_CHAT_FIXTURE.sidebar.agents, [
    ORIGAMI_CHAT_FIXTURE.ids.writerAgent,
    ORIGAMI_CHAT_FIXTURE.ids.researcherAgent,
    ORIGAMI_CHAT_FIXTURE.ids.memoryAgent,
  ]);
  for (const id of ORIGAMI_CHAT_FIXTURE.sidebar.agents) {
    assert.ok(ORIGAMI_CHAT_FIXTURE.agents.some((agent) => agent.id === id));
  }
});

test('fixture preserves the reference-backed empty session metrics', () => {
  assert.deepEqual(ORIGAMI_CHAT_FIXTURE.sessionMetrics, {
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
  });
  assert.deepEqual(ORIGAMI_CHAT_FIXTURE.activity, { runs: [], events: [] });
});
