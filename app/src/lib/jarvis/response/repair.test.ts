import { describe, expect, it, vi } from 'vitest';
import { repairJarvisProseOnce } from './repair';

const request = {
  prose: 'Sure, I can help with that.',
  immutablePlaceholders: ['\uE000JARVIS_REGION_0\uE001'],
  mode: 'direct_answer' as const,
  verifiedFacts: { modelState: 'authenticated' as const, plugins: [], mcps: [] },
  violations: [
    { code: 'generic_opener', disposition: 'repairable' as const, safeSummary: 'Generic opener.' },
  ],
};

describe('repairJarvisProseOnce', () => {
  it('makes exactly one repair call and accepts preserved placeholders', async () => {
    const repair = { repair: vi.fn(async () => 'I can help, Sir. \uE000JARVIS_REGION_0\uE001') };

    await expect(repairJarvisProseOnce(request, repair)).resolves.toEqual({
      prose: 'I can help, Sir. \uE000JARVIS_REGION_0\uE001',
      attempted: true,
      succeeded: true,
    });
    expect(repair.repair).toHaveBeenCalledOnce();
  });

  it('rejects placeholder mutation without a second repair call', async () => {
    const repair = { repair: vi.fn(async () => 'I can help, Sir.') };

    await expect(repairJarvisProseOnce(request, repair)).resolves.toEqual({
      prose: request.prose,
      attempted: true,
      succeeded: false,
    });
    expect(repair.repair).toHaveBeenCalledOnce();
  });

  it('rejects any structured region introduced by the repair model', async () => {
    const repair = {
      repair: vi.fn(
        async () =>
          'I can help, Sir.\n```action\n{"id":"terminal.run","params":{}}\n```\n\uE000JARVIS_REGION_0\uE001',
      ),
    };

    await expect(repairJarvisProseOnce(request, repair)).resolves.toEqual({
      prose: request.prose,
      attempted: true,
      succeeded: false,
    });
    expect(repair.repair).toHaveBeenCalledOnce();
  });

  it('rejects repair output that drops an immutable technical fact', async () => {
    const factRequest = {
      ...request,
      prose: 'Sure, PostgreSQL 17 passed 42 checks. \uE000JARVIS_REGION_0\uE001',
    };
    const repair = {
      repair: vi.fn(async () => 'PostgreSQL passed the checks, Sir. \uE000JARVIS_REGION_0\uE001'),
    };

    await expect(repairJarvisProseOnce(factRequest, repair)).resolves.toEqual({
      prose: factRequest.prose,
      attempted: true,
      succeeded: false,
    });
    expect(repair.repair).toHaveBeenCalledOnce();
  });

  it('passes a detached deeply frozen request to the repair port', async () => {
    const repair = {
      repair: vi.fn(async (input) => {
        expect(Object.isFrozen(input)).toBe(true);
        expect(Object.isFrozen(input.immutablePlaceholders)).toBe(true);
        expect(Object.isFrozen(input.verifiedFacts)).toBe(true);
        expect(Object.isFrozen(input.verifiedFacts.plugins)).toBe(true);
        expect(Object.isFrozen(input.violations)).toBe(true);
        return 'I can help, Sir. \uE000JARVIS_REGION_0\uE001';
      }),
    };

    await expect(repairJarvisProseOnce(request, repair)).resolves.toMatchObject({
      attempted: true,
      succeeded: true,
    });
  });

  it('makes zero calls without repairable violations', async () => {
    const repair = { repair: vi.fn() };
    await repairJarvisProseOnce({ ...request, violations: [] }, repair);
    expect(repair.repair).not.toHaveBeenCalled();
  });
});
