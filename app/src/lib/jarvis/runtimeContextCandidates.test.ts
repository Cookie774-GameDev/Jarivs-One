import { describe, expect, it } from 'vitest';
import { JARVIS_ALL_ABOUT_ME_SOURCE_ID } from './promptCompiler';
import {
  buildJarvisRuntimeContextCandidates,
  type JarvisRuntimeContextBlockKey,
} from './runtimeContextCandidates';

const EXPECTED = {
  project: ['project', 'app_verified', 'user_authored', 'answer', false],
  project_tree: ['context_node', 'app_verified', 'app_observed', 'answer', false],
  user_identity: ['memory', 'user_direct', 'user_authored', 'preference', false],
  default_write_folder: ['project', 'app_verified', 'app_observed', 'execution', false],
  all_about_me: ['memory', 'app_verified', 'mixed', 'preference', false],
  plugin_context: ['plugin', 'external_untrusted', 'external_retrieved', 'answer', false],
  plugin_status: ['plugin', 'app_verified', 'app_observed', 'capability', false],
  selected_skills: ['tool_result', 'user_direct', 'user_authored', 'execution', false],
  resolved_context: ['context_node', 'app_verified', 'app_observed', 'answer', false],
  intent_policy: ['tool_result', 'app_verified', 'app_observed', 'execution', false],
  interaction_mode: ['tool_result', 'app_verified', 'app_observed', 'execution', false],
  structured_context: ['user_message', 'user_direct', 'user_authored', 'answer', true],
  mentioned_agents: ['agent_output', 'external_untrusted', 'external_retrieved', 'answer', false],
  explicit_context: ['context_node', 'user_direct', 'user_authored', 'answer', true],
  explicit_files: ['project_file', 'user_direct', 'user_authored', 'answer', true],
  explicit_terminal: ['terminal', 'external_untrusted', 'external_retrieved', 'answer', true],
  coordination: ['agent_output', 'app_verified', 'app_observed', 'execution', false],
  terminal_operating: ['terminal', 'app_verified', 'app_observed', 'execution', false],
  connected_files: ['project_file', 'user_direct', 'user_authored', 'answer', true],
  terminal_transcript: ['terminal', 'external_untrusted', 'external_retrieved', 'answer', false],
  completion_instruction: ['tool_result', 'app_verified', 'app_observed', 'execution', false],
} as const satisfies Record<
  JarvisRuntimeContextBlockKey,
  readonly [string, string, string, string, boolean]
>;

describe('buildJarvisRuntimeContextCandidates', () => {
  it('projects every runtime block into distinct honest source metadata', () => {
    const keys = Object.keys(EXPECTED) as JarvisRuntimeContextBlockKey[];
    const candidates = buildJarvisRuntimeContextCandidates({
      accountId: 'account-1',
      requestId: 'request-1',
      projectId: 'project-1',
      observedAt: 100,
      blocks: keys.map((key) => ({ key, text: `body:${key}` })),
    });

    expect(candidates).toHaveLength(keys.length);
    candidates.forEach((candidate, index) => {
      const key = keys[index]!;
      const expected = EXPECTED[key];
      expect([
        candidate.source.kind,
        candidate.source.trust,
        candidate.source.origin,
        candidate.purpose,
        candidate.explicitlyAttached,
      ]).toEqual(expected);
      expect(candidate.source.accountId).toBe('account-1');
      expect(candidate.source.projectId).toBe('project-1');
      expect(candidate.source.observedAt).toBe(100);
      expect(candidate.freshness).toBe('current');
      expect(candidate.authorizedBody).toBe(true);
      expect(candidate.excerpt).toBe(`body:${key}`);
    });
    expect(
      candidates.find((candidate) => candidate.source.label === 'AllAboutMe profile')?.source.id,
    ).toBe(JARVIS_ALL_ABOUT_ME_SOURCE_ID);
  });

  it('omits blank blocks and returns detached deeply frozen candidates', () => {
    const input = {
      accountId: 'account-1',
      requestId: 'request-1',
      observedAt: 100,
      blocks: [
        { key: 'project' as const, text: 'project body' },
        { key: 'plugin_context' as const, text: '   ' },
      ],
    };
    const candidates = buildJarvisRuntimeContextCandidates(input);
    input.blocks[0]!.text = 'mutated';

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.excerpt).toBe('project body');
    expect(JSON.stringify(candidates)).not.toContain('mutated');
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(Object.isFrozen(candidates[0])).toBe(true);
    expect(Object.isFrozen(candidates[0]?.source)).toBe(true);
  });

  it('uses stable unique source ids without placing context bodies in metadata', () => {
    const candidates = buildJarvisRuntimeContextCandidates({
      accountId: 'account-1',
      requestId: 'request-1',
      observedAt: 100,
      blocks: [
        { key: 'project', text: 'private project body' },
        { key: 'explicit_files', text: 'private attached body' },
      ],
    });

    expect(new Set(candidates.map((candidate) => candidate.source.id)).size).toBe(2);
    expect(JSON.stringify(candidates.map((candidate) => candidate.source))).not.toMatch(
      /private project body|private attached body/,
    );
  });
});
