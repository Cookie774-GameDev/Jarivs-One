import { afterEach, describe, expect, it } from 'vitest';
import { __setCachedDefaultWriteDirForTests } from './defaultWriteDir';
import { inferFallbackActionProposals } from './fallbackActions';

describe('inferFallbackActionProposals', () => {
  it('does not reinterpret a protected Context tool directive as files.read', () => {
    const proposals = inferFallbackActionProposals(
      [
        'Call the real `vibespace_context` function now.',
        'If a search item preview contains the complete answer, cite that item record title/path.',
        'Only call `operation="open"` when the preview is insufficient.',
        'No mandatory coordination-file read applies.',
      ].join('\n'),
      'Read /path after user approval.',
    );

    expect(proposals).toEqual([]);
  });

  it('does not reinterpret a multi-question Context tool directive as a schedule', () => {
    const proposals = inferFallbackActionProposals(
      [
        'Call the real `vibespace_context` function once for each of the five numbered questions, using these exact bounded argument objects in order:',
        '{"operation":"search","query":"what recovery color belongs to Observatory Lumen?","limit":3}',
        'Run all five searches before answering.',
        'For every answer, include the exact matching record title.',
      ].join('\n'),
      'I will run those searches.',
    );

    expect(proposals).toEqual([]);
  });

  afterEach(() => {
    __setCachedDefaultWriteDirForTests(null);
  });

  it('proposes opening Settings when a local model only replies in prose', () => {
    const proposals = inferFallbackActionProposals(
      'Okay can you open the settings page please',
      "I'll open the Settings page for you.",
    );

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      action_id: 'settings.open',
      params: {},
      rationale: expect.stringMatching(/settings/i),
    });
  });

  it('proposes the Plugins settings tab for plugin connection questions', () => {
    const proposals = inferFallbackActionProposals(
      'show me connected plugins in VibeSpace',
      'You can navigate to Settings and then Plugins.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'settings.plugins',
      params: {},
    });
  });

  it('proposes broadcasting opencode to existing terminals', () => {
    const proposals = inferFallbackActionProposals(
      'type opencode in all of the terminals and click enter please',
      'I will run opencode in all terminals.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'terminal.sendAll',
      params: { command: 'opencode' },
    });
  });

  it('proposes opening a requested number of new terminal panes', () => {
    const proposals = inferFallbackActionProposals(
      'open five terminals',
      'Here is some JavaScript you could use to open terminals.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'terminal.bulkOpen',
      params: { count: 5 },
      rationale: expect.stringMatching(/5 terminal/i),
    });
  });

  it('proposes opening bulk terminals with a shared startup command', () => {
    const proposals = inferFallbackActionProposals(
      'open 5 terminals with opencode',
      'Run this code to create five panes.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'terminal.bulkOpen',
      params: { count: 5, command: 'opencode' },
    });
  });

  it('proposes opening one terminal with a requested command', () => {
    const proposals = inferFallbackActionProposals(
      'Open a terminal and run Get-Location.',
      'I opened the terminal and ran the command.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'terminal.run',
      params: { command: 'Get-Location' },
    });
  });

  it('prefers terminal.run for one terminal with an explicit PowerShell command', () => {
    const command =
      "Set-Content -LiteralPath 'C:\\Users\\viper\\Downloads\\terminal-proof.txt' -Value 'PROOF' -NoNewline";
    const proposals = inferFallbackActionProposals(
      `Open one terminal and run this exact PowerShell command: ${command}`,
      'I cannot run commands.',
    );

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      action_id: 'terminal.run',
      params: { command },
    });
  });

  it('does not open terminals for vague terminal questions', () => {
    expect(
      inferFallbackActionProposals(
        'why are my terminals weird?',
        'The terminal output may be distorted.',
      ),
    ).toEqual([]);
  });

  it('does not invent actions for vague requests', () => {
    expect(inferFallbackActionProposals('can you help me?', 'Sure.')).toEqual([]);
  });

  it('proposes files.create when the user asks to create a file at an absolute path', () => {
    const proposals = inferFallbackActionProposals(
      'Jarvis make me a file here: "C:\\Users\\viper\\Downloads" okay and write a short story about dogs in it',
      "I can't fulfill this request.",
    );

    expect(proposals.some((p) => p.action_id === 'files.create')).toBe(true);
    const write = proposals.find((p) => p.action_id === 'files.create');
    expect(String(write?.params.path)).toMatch(/Downloads/i);
    expect(String(write?.params.path)).toMatch(/\.txt$/i);
    expect(String(write?.params.content).length).toBeGreaterThan(5);
  });

  it('preserves content after an explicit exact-content marker', () => {
    const proposals = inferFallbackActionProposals(
      'Create a text file at "C:\\Users\\viper\\Downloads\\qualification.txt" that contains exactly: VibeSpace llama3.2 verified file action.',
      'I cannot write files.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'files.create',
      params: {
        path: 'C:\\Users\\viper\\Downloads\\qualification.txt',
        content: 'VibeSpace llama3.2 verified file action.',
      },
    });
  });

  it('does not infer a read action from the word read inside a create target filename', () => {
    const proposals = inferFallbackActionProposals(
      'Create C:\\Users\\viper\\Downloads\\vibespace-read-proof-817.txt that contains exactly: LOCAL_FILE_PROOF_817.',
      'I cannot write files.',
    );

    expect(proposals.map(({ action_id }) => action_id)).toEqual(['files.create']);
  });

  it('does not infer a write action from the word write inside a read target filename', () => {
    const proposals = inferFallbackActionProposals(
      'Read C:\\Users\\viper\\VibeSpace-RLM-UAT\\native-write-proof.txt and return its exact contents.',
      'I need permission to read that file.',
    );

    expect(proposals.map(({ action_id }) => action_id)).toEqual(['files.read']);
  });

  it('does not infer a file write from an explicit no-edits review continuation', () => {
    const proposals = inferFallbackActionProposals(
      'Now analyze the approved file content. Identify one real issue, make no edits, and end with one line beginning RESULT:.',
      'I will provide the review.',
    );

    expect(proposals.find((proposal) => proposal.action_id === 'files.create')).toBeUndefined();
  });

  it('proposes files.edit for an explicit whole-file replacement', () => {
    const proposals = inferFallbackActionProposals(
      'Update the existing file "C:\\Users\\viper\\VibeSpace-RLM-UAT\\native-write-proof.txt" by replacing its entire contents with exactly: VIBESPACE_NATIVE_EDIT_PROOF_20260812.',
      'Here is some example code instead.',
    );

    expect(proposals.map(({ action_id }) => action_id)).toEqual(['files.edit']);
    expect(proposals[0]).toMatchObject({
      params: {
        path: 'C:\\Users\\viper\\VibeSpace-RLM-UAT\\native-write-proof.txt',
        content: 'VIBESPACE_NATIVE_EDIT_PROOF_20260812.',
      },
    });
  });

  it('joins an explicit directory with the requested filename for a file inspection', () => {
    const proposals = inferFallbackActionProposals(
      'Inspect C:\\Users\\viper\\Downloads and check whether vibespace-read-proof-817.txt exists.',
      'I need to inspect that file.',
    );

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      action_id: 'files.read',
      params: {
        path: 'C:\\Users\\viper\\Downloads\\vibespace-read-proof-817.txt',
      },
    });
  });

  it('does not strip markup quotes from explicitly exact file content', () => {
    const proposals = inferFallbackActionProposals(
      'Create a file at "C:\\Users\\viper\\Downloads\\game.html" that contains exactly: <!doctype html><button id="play">Play</button>',
      'I cannot write files.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'files.create',
      params: {
        content: '<!doctype html><button id="play">Play</button>',
      },
    });
  });

  it('does not turn a capability ledger into a file-create action', () => {
    const proposals = inferFallbackActionProposals(
      'Give a compact qualification ledger. Mark memory recall, file create, file read, terminal execution, HTML generation, and multitask as PASS or FAIL.',
      'Here is the requested ledger.',
    );

    expect(proposals).toEqual([]);
  });

  it('proposes files.create into a general default folder when no path is given', () => {
    __setCachedDefaultWriteDirForTests(
      'C:\\Users\\demo\\AppData\\Roaming\\ai.jarvis.desktop\\Projects',
    );
    const proposals = inferFallbackActionProposals(
      'Jarvis make me a file and write a short story about cats in it',
      "I can't write files.",
    );

    expect(proposals.some((p) => p.action_id === 'files.create')).toBe(true);
    const write = proposals.find((p) => p.action_id === 'files.create');
    expect(String(write?.params.path)).toMatch(/jarvis-note\.txt$/i);
    expect(String(write?.params.content).toLowerCase()).toMatch(/cat/);
    expect(write?.params.root).toBe(
      'C:\\Users\\demo\\AppData\\Roaming\\ai.jarvis.desktop\\Projects',
    );
  });

  it('does not authorize an explicit path by labeling it as the default root', () => {
    __setCachedDefaultWriteDirForTests(
      'C:\\Users\\demo\\AppData\\Roaming\\ai.jarvis.desktop\\Projects',
    );
    const proposals = inferFallbackActionProposals(
      'Create a text file at "C:\\Users\\demo\\Downloads\\qualification.txt" that contains exactly: VibeSpace file action.',
      'I cannot write files.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'files.create',
      params: {
        path: 'C:\\Users\\demo\\Downloads\\qualification.txt',
        content: 'VibeSpace file action.',
      },
    });
    expect(proposals[0]?.params.root).toBeUndefined();
  });

  it('proposes files.read when the user asks to inspect an absolute file path', () => {
    const proposals = inferFallbackActionProposals(
      'Read this file directly: "C:\\Users\\viper\\Downloads\\source.txt"',
      'I cannot access files on your computer.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'files.read',
      params: { path: 'C:\\Users\\viper\\Downloads\\source.txt' },
    });
  });

  it('treats a read-only file review as a real file-read request', () => {
    const proposals = inferFallbackActionProposals(
      'Review C:\\Users\\viper\\VibeSpace-RLM-UAT\\build-corpus.mjs for one real functional bug. Read only.',
      'I will review the file.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'files.read',
      params: { path: 'C:\\Users\\viper\\VibeSpace-RLM-UAT\\build-corpus.mjs' },
    });
  });

  it('runs the exact saved agent when the user explicitly requests one bounded child', () => {
    const request =
      'Spawn one sub-agent to review C:\\Users\\viper\\VibeSpace-RLM-UAT\\build-corpus.mjs for one real functional bug or usability issue. Use the saved agent id agt_BPTbjAHi36MThyOB only. The child must use installed local Ollama Llama 3.2, must not edit files or use the network, and must not spawn more children. Wait for it and report its result.';
    const proposals = inferFallbackActionProposals(
      request,
      'I need permission to read that file.',
    );

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      action_id: 'agent.run',
      params: {
        agentId: 'agt_BPTbjAHi36MThyOB',
        task: expect.stringMatching(
          /^Review C:\\Users\\viper\\VibeSpace-RLM-UAT\\build-corpus\.mjs[\s\S]*must not spawn more children/i,
        ),
      },
      rationale: expect.stringMatching(/saved agent/i),
    });
  });

  it('preserves a trailing bounded source excerpt in the delegated child task', () => {
    const proposals = inferFallbackActionProposals(
      'Spawn one sub-agent to review this bounded source excerpt for one bug. Use the saved agent id agt_BPTbjAHi36MThyOB only. The child must not edit files or spawn more children. Wait for it. Source excerpt: pending = paragraph;',
      'I can run the saved agent.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'agent.run',
      params: {
        agentId: 'agt_BPTbjAHi36MThyOB',
        task: expect.stringContaining('Source excerpt: pending = paragraph;'),
      },
    });
  });

  it('does not mistake a worker wrapper plus build-prefixed filename for an agent-creator request', () => {
    const proposals = inferFallbackActionProposals(
      [
        'You are a chat-native Jarvis multitask agent inside the VibeSpace chat interface.',
        'You are a worker for a parent chat supervisor. Stay in this thread and complete the assigned task.',
        'Task: Review C:\\Users\\viper\\VibeSpace-RLM-UAT\\build-corpus.mjs for one real functional bug. Read only.',
      ].join('\n'),
      'I will review the file.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'files.read',
      params: { path: 'C:\\Users\\viper\\VibeSpace-RLM-UAT\\build-corpus.mjs' },
    });
    expect(proposals.some((proposal) => proposal.action_id === 'creator.start')).toBe(false);
  });

  it('proposes creating a Jarvis schedule from natural language', () => {
    const proposals = inferFallbackActionProposals(
      'Make a schedule to check AI news every morning',
      'Done, I can make that schedule.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'schedule.create',
      params: expect.objectContaining({
        recurrence: 'daily',
        prompt: 'make a schedule to check ai news every morning',
      }),
    });
  });

  it('preserves a quoted schedule name and resolves tomorrow at a stated time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T07:07:00-05:00'));
    const proposals = inferFallbackActionProposals(
      'Create a one-time VibeSpace schedule named "RLM UAT Schedule — Owner Verify". Make it a harmless local reminder tomorrow at 9:00 AM.',
      'I can create that schedule.',
    );
    vi.useRealTimers();

    expect(proposals[0]).toMatchObject({
      action_id: 'schedule.create',
      params: {
        title: 'RLM UAT Schedule — Owner Verify',
        recurrence: 'once',
        startAtMs: new Date('2026-08-13T09:00:00-05:00').getTime(),
      },
    });
  });

  it('proposes launching the Make with Jarvis agent creator for agent requests', () => {
    const proposals = inferFallbackActionProposals(
      'make an agent that reviews pull requests',
      'I can help you draft that agent.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'creator.start',
      params: { kind: 'agent' },
      rationale: expect.stringMatching(/agent/i),
    });
  });

  it('recognizes a named VibeSpace agent request', () => {
    const proposals = inferFallbackActionProposals(
      'Create a VibeSpace agent named "RLM UAT Agent — Llama32" and configure it to use local Ollama Llama 3.2.',
      'Here is example Python code.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'creator.start',
      params: { kind: 'agent' },
    });
  });

  it('recognizes a named VibeSpace skill request', () => {
    const proposals = inferFallbackActionProposals(
      'Create a VibeSpace skill named "RLM UAT Skill — File Inspector".',
      'Here is example code.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'creator.start',
      params: { kind: 'skill' },
    });
  });

  it('proposes launching the Make with Jarvis skill creator for skill requests', () => {
    const proposals = inferFallbackActionProposals(
      'create a skill for writing release notes',
      'I can help you make that skill.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'creator.start',
      params: { kind: 'skill' },
      rationale: expect.stringMatching(/skill/i),
    });
  });

  it('does not re-open Make with Jarvis when the user is answering creator skill questions', () => {
    const proposals = inferFallbackActionProposals(
      [
        'What do you want this skill to do?: create a reminder skill for team checks',
        'How should it behave in detail? Include examples, boundaries, tone, and do-not-dos.: be polite and brief',
      ].join('\n'),
      'I can draft that skill for you.',
    );

    expect(proposals.find((p) => p.action_id === 'creator.start')).toBeUndefined();
  });

  it('does not infer filesystem actions from creator skill answer dumps', () => {
    const proposals = inferFallbackActionProposals(
      [
        'What do you want this skill to do?: Create a skill named RLM UAT Skill — File Inspector that inspects one user-approved local file and reports its structure without modifying it or using the network.',
        'How should it behave in detail?: Read only the exact file the user approves. Never edit or create files.',
      ].join('\n'),
      'I will draft the skill.',
    );

    expect(proposals).toEqual([]);
  });

  it('does not re-open Make with Jarvis for agent creator answer dumps', () => {
    const proposals = inferFallbackActionProposals(
      [
        'What do you want this agent to do?: review pull requests',
        'How should it behave in detail? Include rules, tools, boundaries, tone, and do-not-dos.: be careful',
      ].join('\n'),
      'Sure.',
    );

    expect(proposals.find((p) => p.action_id === 'creator.start')).toBeUndefined();
  });

  it('proposes closing a stated number of terminal panes', () => {
    const proposals = inferFallbackActionProposals(
      'close 5 terminals',
      'You can close terminals by clicking the X on each pane.',
    );

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      action_id: 'terminal.bulkClose',
      params: { count: 5 },
      rationale: expect.stringMatching(/5 terminal/i),
    });
  });

  it('proposes closing terminals when the request has a slash surface prefix', () => {
    const proposals = inferFallbackActionProposals(
      '/terminals close 5 terminals',
      'To close terminals, click the X on each pane.',
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'terminal.bulkClose',
      params: { count: 5 },
    });
  });

  it('proposes closing all terminals for "close all terminals"', () => {
    const proposals = inferFallbackActionProposals(
      'close all terminals',
      "Sure, I'll close all terminals.",
    );

    expect(proposals[0]).toMatchObject({
      action_id: 'terminal.bulkClose',
      params: { count: 10 },
    });
  });
});
