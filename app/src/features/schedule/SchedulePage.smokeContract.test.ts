import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scheduleSource = readFileSync(
  path.join(process.cwd(), 'src', 'features', 'schedule', 'SchedulePage.tsx'),
  'utf8',
);
const navSource = readFileSync(
  path.join(process.cwd(), 'src', 'components', 'layout', 'NavPane.tsx'),
  'utf8',
);
const runtimeSource = readFileSync(
  path.join(process.cwd(), 'src', 'lib', 'ai', 'runtime.ts'),
  'utf8',
);

describe('native-bound schedule smoke controls', () => {
  it('enters through the real Schedule surface and due-schedule runner', () => {
    expect(navSource).toContain('SIK_CONTROL.scheduleFixture');
    expect(scheduleSource).toContain('SIK_CONTROL.scheduleDispatch');
    expect(scheduleSource).toContain('SIK_CONTROL.scheduleRetryFixture');
    expect(scheduleSource).toContain('buildJarvisScheduleEventInput');
    expect(scheduleSource).toContain('runDueJarvisSchedules');
    expect(scheduleSource).toContain('runManualCaoLearningChecks');
    expect(scheduleSource).toContain('CAO supervision');
    expect(scheduleSource).not.toContain('runCaoScheduledLearning(');
    expect(scheduleSource).toContain('const protectedJarvisAgent = useAgentStore(');
    expect(scheduleSource).toContain('kernelSmokeUnavailableState');
    expect(scheduleSource).toContain(
      'disabled={kernelSmokeDispatching || !!kernelSmokeUnavailableState}',
    );
    expect(scheduleSource).toContain('flushUiStatePersistence();');
    expect(runtimeSource).toContain("messageHistory: [{ role: 'user', content: metadata.prompt }]");
    expect(scheduleSource).not.toContain('jarvisRunRepo');
    expect(scheduleSource).not.toContain('appendEvent(');
  });

  it('uses selector constants instead of literal execution attributes', () => {
    expect(navSource).not.toContain('data-sik-evidence="schedule.fixture"');
    expect(scheduleSource).not.toContain('data-sik-evidence="schedule.dispatch"');
    expect(scheduleSource).not.toContain('data-sik-evidence="schedule.retry-fixture"');
  });
});
