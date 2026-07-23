import { describe, expect, it, vi } from 'vitest';
import { JARVIS_REPAIR_INSTRUCTION, repairJarvisProseOnce } from './repair';

const EXPECTED_REPAIR_INSTRUCTION = [
  'Rewrite only the conversational prose to satisfy the JARVIS response contract.',
  'Preserve every fact, number, status, name, path, link, citation, warning, technical conclusion, placeholder, and action state.',
  'Do not modify or add code, JSON, tool calls, structured blocks, citations, URLs, quoted material, or humor.',
  'Do not rerun tools.',
  'Return only the repaired prose.',
].join('\n');

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
        expect(input.instruction).toBe(EXPECTED_REPAIR_INSTRUCTION);
        return 'I can help, Sir. \uE000JARVIS_REGION_0\uE001';
      }),
    };

    await expect(repairJarvisProseOnce(request, repair)).resolves.toMatchObject({
      attempted: true,
      succeeded: true,
    });
  });

  it('owns one tiny strict prose-only instruction that callers cannot weaken', async () => {
    const repair = {
      repair: vi.fn(async (input) => {
        expect(JARVIS_REPAIR_INSTRUCTION).toBe(EXPECTED_REPAIR_INSTRUCTION);
        expect(input.instruction).toBe(JARVIS_REPAIR_INSTRUCTION);
        expect(input.instruction.length).toBeLessThanOrEqual(600);
        return 'I can help, Sir. \uE000JARVIS_REGION_0\uE001';
      }),
    };

    await expect(repairJarvisProseOnce(request, repair)).resolves.toMatchObject({
      attempted: true,
      succeeded: true,
    });
    expect(repair.repair).toHaveBeenCalledOnce();
  });

  it('makes zero calls without repairable violations', async () => {
    const repair = { repair: vi.fn() };
    await repairJarvisProseOnce({ ...request, violations: [] }, repair);
    expect(repair.repair).not.toHaveBeenCalled();
  });
});
