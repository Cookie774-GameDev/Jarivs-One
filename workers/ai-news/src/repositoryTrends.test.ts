import { describe, expect, it } from 'vitest';
import { APPROVED_AI_REPOSITORIES, parseGitHubRepository, trendSignal } from './repositoryTrends';

describe('approved AI repository trends', () => {
  it('uses a bounded unique repository allowlist', () => {
    expect(APPROVED_AI_REPOSITORIES.length).toBeGreaterThanOrEqual(5);
    expect(APPROVED_AI_REPOSITORIES.length).toBeLessThanOrEqual(12);
    expect(new Set(APPROVED_AI_REPOSITORIES.map((repository) => repository.fullName)).size).toBe(
      APPROVED_AI_REPOSITORIES.length,
    );
  });

  it('preserves readable GitHub metadata and a measured trend delta', () => {
    const parsed = parseGitHubRepository(
      APPROVED_AI_REPOSITORIES[0]!,
      {
        full_name: APPROVED_AI_REPOSITORIES[0]!.fullName,
        html_url: `https://github.com/${APPROVED_AI_REPOSITORIES[0]!.fullName}`,
        description: 'Official AI tooling repository.',
        stargazers_count: 125,
        forks_count: 20,
        open_issues_count: 4,
        language: 'TypeScript',
        pushed_at: '2026-08-22T01:02:03Z',
      },
      120,
      '2026-08-22T02:00:00Z',
    );
    expect(parsed).toMatchObject({
      stars: 125,
      starDelta: 5,
      language: 'TypeScript',
      pushedAt: '2026-08-22T01:02:03.000Z',
      observedAt: '2026-08-22T02:00:00.000Z',
    });
    expect(trendSignal(parsed.starDelta)).toBe('+5 stars since last check');
  });

  it('rejects a payload that changes the allowlisted repository identity', () => {
    expect(() =>
      parseGitHubRepository(
        APPROVED_AI_REPOSITORIES[0]!,
        {
          full_name: 'attacker/repository',
          html_url: 'https://github.com/attacker/repository',
          stargazers_count: 1,
          forks_count: 0,
          open_issues_count: 0,
          pushed_at: '2026-08-22T01:02:03Z',
        },
        null,
        '2026-08-22T02:00:00Z',
      ),
    ).toThrow(/identity/i);
  });
});
