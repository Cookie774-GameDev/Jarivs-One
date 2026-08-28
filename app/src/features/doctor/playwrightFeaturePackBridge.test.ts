import { describe, expect, it, vi } from 'vitest';
import {
  createPlaywrightFeaturePackBridge,
  runPlaywrightFeaturePackDoctorCheck,
  type PlaywrightFeaturePackDiagnosis,
} from './playwrightFeaturePackBridge';

function diagnosis(
  overrides: Partial<PlaywrightFeaturePackDiagnosis> = {},
): PlaywrightFeaturePackDiagnosis {
  return {
    status: 'absent',
    productionTrustConfigured: true,
    repairArtifactConfigured: false,
    externalPrerequisite: 'production-signed-artifact',
    ...overrides,
  };
}

describe('Playwright feature-pack native bridge', () => {
  it('uses only the fixed native command contract and passes only a caller-local artifact path', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(diagnosis())
      .mockResolvedValueOnce({
        action: 'installed',
        installationId: 'version-id',
        manifestSha256: 'a'.repeat(64),
        measuredBytes: 4,
        cleanupPending: false,
        removedInstallations: 0,
      })
      .mockResolvedValueOnce({
        action: 'repaired',
        installationId: 'version-id',
        manifestSha256: 'a'.repeat(64),
        measuredBytes: 4,
        cleanupPending: false,
        removedInstallations: 0,
      })
      .mockResolvedValueOnce({
        action: 'rolled-back',
        installationId: 'version-id',
        manifestSha256: 'a'.repeat(64),
        measuredBytes: 4,
        cleanupPending: false,
        removedInstallations: 0,
      })
      .mockResolvedValueOnce({
        installationId: 'version-id',
        measuredBytes: 4,
        manifestSha256: 'a'.repeat(64),
      })
      .mockResolvedValueOnce({
        action: 'uninstalled',
        cleanupPending: false,
        removedInstallations: 1,
      });
    const bridge = createPlaywrightFeaturePackBridge(invoke);

    await bridge.diagnose();
    await bridge.installOrUpdate('C:\\local\\signed-pack');
    await bridge.repair('C:\\local\\signed-pack');
    await bridge.rollback();
    await bridge.measure();
    await bridge.uninstall();

    expect(invoke.mock.calls).toEqual([
      ['playwright_feature_pack_diagnose'],
      ['playwright_feature_pack_install_or_update', { artifactRoot: 'C:\\local\\signed-pack' }],
      ['playwright_feature_pack_repair', { artifactRoot: 'C:\\local\\signed-pack' }],
      ['playwright_feature_pack_rollback'],
      ['playwright_feature_pack_measure'],
      ['playwright_feature_pack_uninstall'],
    ]);
  });

  it('reports missing production trust as an exact external prerequisite without mutation', async () => {
    const invoke = vi.fn().mockResolvedValue(
      diagnosis({
        status: 'unsupported',
        reason: 'production_trust_not_configured',
        productionTrustConfigured: false,
        externalPrerequisite: 'production-trust-and-signed-artifact',
      }),
    );
    const check = await runPlaywrightFeaturePackDoctorCheck(
      createPlaywrightFeaturePackBridge(invoke),
    );

    expect(check).toEqual({
      label: 'Playwright acceptance runtime',
      ok: false,
      detail:
        'External prerequisite required · production_trust_not_configured · production-trust-and-signed-artifact',
    });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('repairs corruption only through the configured native artifact and verifies health afterward', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(
        diagnosis({
          status: 'corrupt',
          reason: 'installed_runtime_corrupt',
          repairArtifactConfigured: true,
          externalPrerequisite: undefined,
        }),
      )
      .mockResolvedValueOnce({
        action: 'repaired',
        installationId: 'version-id',
        manifestSha256: 'a'.repeat(64),
        measuredBytes: 4,
        cleanupPending: false,
        removedInstallations: 0,
      })
      .mockResolvedValueOnce(
        diagnosis({
          status: 'healthy',
          installationId: 'version-id',
          playwrightVersion: '1.61.1',
          browserRevision: '1234567',
          measuredBytes: 4,
          repairArtifactConfigured: true,
          externalPrerequisite: undefined,
        }),
      );

    const check = await runPlaywrightFeaturePackDoctorCheck(
      createPlaywrightFeaturePackBridge(invoke),
    );

    expect(check).toEqual({
      label: 'Playwright acceptance runtime',
      ok: true,
      detail: 'Recovered from configured signed artifact · Playwright 1.61.1 · Chromium 1234567',
    });
    expect(invoke.mock.calls).toEqual([
      ['playwright_feature_pack_diagnose'],
      ['playwright_feature_pack_repair_configured'],
      ['playwright_feature_pack_diagnose'],
    ]);
  });

  it('never installs an absent runtime or repairs corruption without a configured artifact', async () => {
    const absentInvoke = vi.fn().mockResolvedValue(diagnosis());
    const absent = await runPlaywrightFeaturePackDoctorCheck(
      createPlaywrightFeaturePackBridge(absentInvoke),
    );
    expect(absent.ok).toBe(false);
    expect(absent.detail).toContain('no install was attempted');
    expect(absentInvoke).toHaveBeenCalledOnce();

    const corruptInvoke = vi
      .fn()
      .mockResolvedValue(diagnosis({ status: 'corrupt', reason: 'installed_runtime_corrupt' }));
    const corrupt = await runPlaywrightFeaturePackDoctorCheck(
      createPlaywrightFeaturePackBridge(corruptInvoke),
    );
    expect(corrupt.ok).toBe(false);
    expect(corrupt.detail).toContain('production-signed-artifact');
    expect(corruptInvoke).toHaveBeenCalledOnce();
  });

  it('fails closed on malformed native responses and unsuccessful post-repair diagnosis', async () => {
    const malformed = await runPlaywrightFeaturePackDoctorCheck(
      createPlaywrightFeaturePackBridge(vi.fn().mockResolvedValue({ status: 'healthy' })),
    );
    expect(malformed).toEqual({
      label: 'Playwright acceptance runtime',
      ok: false,
      detail: 'Check failed safely · playwright_feature_pack_diagnosis_invalid',
    });

    const invoke = vi
      .fn()
      .mockResolvedValueOnce(
        diagnosis({
          status: 'corrupt',
          reason: 'installed_runtime_corrupt',
          repairArtifactConfigured: true,
          externalPrerequisite: undefined,
        }),
      )
      .mockResolvedValueOnce({ action: 'repaired', cleanupPending: false, removedInstallations: 0 })
      .mockResolvedValueOnce(
        diagnosis({
          status: 'corrupt',
          reason: 'installed_runtime_corrupt',
          repairArtifactConfigured: true,
          externalPrerequisite: undefined,
        }),
      );
    const check = await runPlaywrightFeaturePackDoctorCheck(
      createPlaywrightFeaturePackBridge(invoke),
    );
    expect(check.ok).toBe(false);
    expect(check.detail).toContain('repair_not_verified');
  });

  it('rejects a healthy diagnosis whose Playwright version is not the exact pinned version', async () => {
    const check = await runPlaywrightFeaturePackDoctorCheck(
      createPlaywrightFeaturePackBridge(
        vi.fn().mockResolvedValue(
          diagnosis({
            status: 'healthy',
            installationId: 'version-id',
            playwrightVersion: '1.61.2',
            browserRevision: '1234567',
            measuredBytes: 4,
          }),
        ),
      ),
    );

    expect(check).toEqual({
      label: 'Playwright acceptance runtime',
      ok: false,
      detail: 'Check failed safely · playwright_feature_pack_diagnosis_invalid',
    });
  });
});
