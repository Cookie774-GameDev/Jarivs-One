import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  attachOfficialNative,
  sanitizeEvidence,
} from '../../scripts/pr31-native-acceptance-harness.mjs';

const expectedHead = process.env.EXPECTED_HEAD;
if (!expectedHead) throw new Error('expected_head_required');
const evidenceDir = path.resolve(
  `.codex-evidence/pr31-siyuan-rlm-native-acceptance-20260828/rlm-${expectedHead.slice(0, 8)}`,
);
await fs.mkdir(evidenceDir, { recursive: true });
const attachment = await attachOfficialNative({
  chromium,
  jarvisPid: Number(process.env.JARVIS_PID ?? '9084'),
  cdpPort: 9223,
});

try {
  const page = attachment.page;
  const result = await page.evaluate(async () => {
    const authority = await import('/src/lib/harness/toolGatewayAuthority.ts');
    const { createProductionToolGatewayDependencies } = await import(
      '/src/lib/harness/toolGatewayProduction.ts'
    );
    const { createToolGatewayRuntime } = await import(
      '/src/lib/harness/toolGatewayRuntime.ts'
    );
    const sessionId = `native-unbound-${crypto.randomUUID()}`;
    const claim = authority.captureToolGatewayAuthorityClaim();
    if (!claim || !authority.bindToolGatewaySessionAuthority(sessionId, claim)) {
      throw new Error('native_session_authority_bind_failed');
    }
    try {
      const observedBefore = authority.readToolGatewayObservedExecutionAuthority(sessionId);
      const dependencies = createProductionToolGatewayDependencies();
      let directError = null;
      try {
        await dependencies.context.rlm(
          { operation: 'investigate', query: 'Trace the frozen Context evidence.' },
          {
            requestId: 'native-unbound-direct',
            sessionId,
            messageId: 'native-unbound-message',
            mutationApproved: false,
          },
        );
      } catch (error) {
        directError = error instanceof Error ? error.message : String(error);
      }
      const response = await createToolGatewayRuntime(dependencies).execute({
        protocolVersion: 1,
        requestId: 'native-unbound-runtime',
        sessionId,
        messageId: 'native-unbound-message',
        tool: 'vibespace_context',
        args: { operation: 'investigate', query: 'Trace the frozen Context evidence.' },
      });
      return {
        sessionAuthorityBound: true,
        observedExecutionIdentityPresent: Boolean(observedBefore),
        directError,
        response,
      };
    } finally {
      authority.releaseToolGatewaySessionAuthority(sessionId);
    }
  });

  if (
    !result.sessionAuthorityBound ||
    result.observedExecutionIdentityPresent ||
    result.directError !== 'gateway_execution_identity_unavailable' ||
    result.response.ok ||
    result.response.code !== 'tool_failed'
  ) {
    throw new Error(`unbound_identity_fail_closed_assertion:${JSON.stringify(result)}`);
  }
  const screenshotPath = path.join(evidenceDir, '01-unbound-identity-fails-closed.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const report = sanitizeEvidence({
    status: 'passed',
    capturedAt: new Date().toISOString(),
    commit: expectedHead,
    scenario:
      'Authorized low-level Context investigate without observed OpenCode execution identity',
    result,
    childDispatchExpected: false,
    screenshotPath,
  });
  await fs.writeFile(
    path.join(evidenceDir, '01-unbound-identity-fails-closed.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await attachment.browser.close();
}
