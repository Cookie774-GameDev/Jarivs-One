import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync, sign as signEd25519 } from 'node:crypto';
import {
  mkdir,
  link,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const releaseScript = path.resolve('scripts/release-windows.ps1');
const manifestScript = path.resolve('scripts/build-updater-manifest.mjs');
const version = '2.3.4';
const canonicalName = `VibeSpace_${version}_x64-setup.exe`;
const friendlyName = `VibeSpace-${version}-Windows-x64.exe`;
const minisignRecord = [
  'untrusted comment: signature from minisign secret key',
  'RWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=',
  'trusted comment: timestamp:1555779966\tfile:test',
  'QtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==',
].join('\n');
const signature = Buffer.from(minisignRecord, 'utf8').toString('base64');

const harnessSource = String.raw`
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Action,
  [Parameter(Mandatory = $true)][string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  $Source, [ref]$tokens, [ref]$errors
)
if ($errors.Count -ne 0) {
  throw ($errors | ForEach-Object Message) -join [Environment]::NewLine
}
$functions = $ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
}, $true)
Invoke-Expression (($functions | ForEach-Object { $_.Extent.Text }) -join [Environment]::NewLine)
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
switch ($Action) {
  'stage' {
    New-ContainedUpdaterStage -ArtifactPath $config.artifactPath -SourceRoot $config.sourceRoot -StageParent $config.stageParent -ContainmentRoot $config.containmentRoot -Version $config.version | ConvertTo-Json -Compress
  }
  'cleanup' {
    $stage = [pscustomobject]@{
      Path = $config.stagePath
      Identity = $config.identity
      ArtifactPath = $config.artifactPath
      SignaturePath = $config.signaturePath
      ManifestPath = $config.manifestPath
    }
    Remove-OwnedUpdaterStage -Stage $stage -StageParent $config.stageParent -ContainmentRoot $config.containmentRoot
  }
  'resolve' {
    Resolve-BundleArtifact -Dir $config.sourceRoot -Patterns @($config.patterns)
  }
  'publish' {
    Publish-UpdaterManifestAtomically -SourcePath $config.sourcePath -DestinationPaths @($config.destinationPaths) -ContainmentRoot $config.containmentRoot -TestFailAfterReplacement $config.testFailAfterReplacement
  }
  'validate' {
    Assert-ReleaseVersionPreflight -Version $config.version -PackageJsonPath $config.packageJsonPath -TauriConfigPath $config.tauriConfigPath
  }
  'verifyStagedSignature' {
    $stage = New-ContainedUpdaterStage -ArtifactPath $config.artifactPath -SourceRoot $config.sourceRoot -StageParent $config.stageParent -ContainmentRoot $config.containmentRoot -Version $config.version -RetainBindings
    try {
      Invoke-BoundUpdaterSignatureVerification -UpdaterStage $stage -ConfiguredPublicKey $config.publicKey -VerifierScriptPath $config.verifierScriptPath
    } finally {
      Close-BoundReleaseFile -Binding $stage.SignatureBinding
      Close-BoundReleaseFile -Binding $stage.ArtifactBinding
      $stage.SignatureBinding = $null
      $stage.ArtifactBinding = $null
      Remove-OwnedUpdaterStage -Stage $stage -StageParent $config.stageParent -ContainmentRoot $config.containmentRoot
    }
  }
  'stageWithSwap' {
    $beforeCopy = {
      Set-Content -LiteralPath $config.swapPath -Value 'attacker replacement'
    }
    New-ContainedUpdaterStage -ArtifactPath $config.artifactPath -SourceRoot $config.sourceRoot -StageParent $config.stageParent -ContainmentRoot $config.containmentRoot -Version $config.version -BeforeCopyTestHook $beforeCopy | ConvertTo-Json -Compress
  }
  'retainedStageSwap' {
    $stage = New-ContainedUpdaterStage -ArtifactPath $config.artifactPath -SourceRoot $config.sourceRoot -StageParent $config.stageParent -ContainmentRoot $config.containmentRoot -Version $config.version -RetainBindings
    try {
      if ($config.swapKind -eq 'manifest') {
        Set-Content -LiteralPath $stage.ManifestPath -Value '{"version":"2.3.4"}'
        $stage.ManifestBinding = Open-BoundReleaseFile -Path $stage.ManifestPath -Label 'Generated updater manifest'
      }
      $swapPath = switch ($config.swapKind) {
        'artifact' { $stage.ArtifactPath }
        'signature' { $stage.SignaturePath }
        'manifest' { $stage.ManifestPath }
        default { throw "Unknown retained-stage swap kind: $($config.swapKind)" }
      }
      Set-Content -LiteralPath $swapPath -Value 'attacker replacement'
    } finally {
      Close-BoundReleaseFile -Binding $stage.ManifestBinding
      Close-BoundReleaseFile -Binding $stage.SignatureBinding
      Close-BoundReleaseFile -Binding $stage.ArtifactBinding
      $stage.ManifestBinding = $null
      $stage.SignatureBinding = $null
      $stage.ArtifactBinding = $null
      Remove-OwnedUpdaterStage -Stage $stage -StageParent $config.stageParent -ContainmentRoot $config.containmentRoot
    }
  }
  'publishAssets' {
    $moveGap = if ($null -eq $config.testFailAfterMoveBeforeBind) { -1 } else { [int]$config.testFailAfterMoveBeforeBind }
    Publish-ReleaseAssetsTransactionally -Assets @($config.assets) -ContainmentRoot $config.containmentRoot -TestFailAfterBackup $config.testFailAfterBackup -TestFailAfterReplacement $config.testFailAfterReplacement -TestFailAfterMoveBeforeBind $moveGap | ConvertTo-Json -Compress
  }
  'publishAssetsWithPriorMutation' {
    $beforeBackup = {
      $stamp = [IO.File]::GetLastWriteTimeUtc($config.mutatePath)
      [IO.File]::WriteAllText($config.mutatePath, $config.mutateValue)
      [IO.File]::SetLastWriteTimeUtc($config.mutatePath, $stamp)
    }
    Publish-ReleaseAssetsTransactionally -Assets @($config.assets) -ContainmentRoot $config.containmentRoot -BeforeBackupTestHook $beforeBackup | ConvertTo-Json -Compress
  }
  'publishAssetsWithRootSwap' {
    $beforeMove = {
      Set-Content -LiteralPath $config.hookMarker -Value 'before-move'
      try {
        Move-Item -LiteralPath $config.containmentRoot -Destination $config.displacedRoot
      } catch {
        Add-Content -LiteralPath $config.hookMarker -Value "move-error:$($_.Exception.Message)"
        throw
      }
      Add-Content -LiteralPath $config.hookMarker -Value 'after-move'
      New-Item -ItemType Junction -Path $config.containmentRoot -Target $config.displacedRoot | Out-Null
      Add-Content -LiteralPath $config.hookMarker -Value 'after-junction'
    }
    Publish-ReleaseAssetsTransactionally -Assets @($config.assets) -ContainmentRoot $config.containmentRoot -BeforeDestinationMoveTestHook $beforeMove | ConvertTo-Json -Compress
  }
  'publishNestedWithParentSwap' {
    $beforeMove = {
      Set-Content -LiteralPath $config.hookMarker -Value 'before-move'
      try {
        Move-Item -LiteralPath $config.destinationParent -Destination $config.displacedParent
      } catch {
        Add-Content -LiteralPath $config.hookMarker -Value "move-error:$($_.Exception.Message)"
        throw
      }
      Add-Content -LiteralPath $config.hookMarker -Value 'after-move'
      New-Item -ItemType Junction -Path $config.destinationParent -Target $config.outsideParent | Out-Null
      Add-Content -LiteralPath $config.hookMarker -Value 'after-junction'
    }
    $entries = @(
      [pscustomobject]@{
        SourcePath = $config.sourcePath
        DestinationPath = $config.destinationPath
      }
    )
    Invoke-TransactionalFilePublication -Entries $entries -ContainmentRoot $config.containmentRoot -Label 'nested manifest' -BeforeDestinationMoveTestHook $beforeMove | ConvertTo-Json -Compress
  }
  'publishWithJournalSnapshots' {
    $afterPrepared = {
      param($journalPath)
      Copy-Item -LiteralPath $journalPath -Destination $config.preparedSnapshot -ErrorAction Stop
    }
    $afterCommitted = {
      param($journalPath, $previousPath)
      Copy-Item -LiteralPath $journalPath -Destination $config.committedSnapshot -ErrorAction Stop
      Copy-Item -LiteralPath $previousPath -Destination $config.previousSnapshot -ErrorAction Stop
    }
    $entries = @(
      [pscustomobject]@{
        SourcePath = $config.sourcePath
        DestinationPath = $config.destinationPath
      }
    )
    Invoke-TransactionalFilePublication -Entries $entries -ContainmentRoot $config.containmentRoot -Label 'journal test' -AfterPreparedJournalTestHook $afterPrepared -AfterCommittedJournalTestHook $afterCommitted | ConvertTo-Json -Compress
  }
  'publishBoundUpdaterRelease' {
    $stage = New-ContainedUpdaterStage -ArtifactPath $config.artifactPath -SourceRoot $config.sourceRoot -StageParent $config.stageParent -ContainmentRoot $config.containmentRoot -Version $config.version -RetainBindings
    try {
      Set-Content -LiteralPath $stage.ManifestPath -Value $config.manifestText -NoNewline
      $stage.ManifestBinding = Open-BoundReleaseFile -Path $stage.ManifestPath -Label 'Generated updater manifest'
      $beforeMove = $null
      if (-not [string]::IsNullOrWhiteSpace([string]$config.swapKind)) {
        $beforeMove = {
          $swapPath = switch ($config.swapKind) {
            'artifact' { $stage.ArtifactPath }
            'signature' { $stage.SignaturePath }
            'manifest' { $stage.ManifestPath }
            default { throw "Unknown bound-publication swap kind: $($config.swapKind)" }
          }
          Set-Content -LiteralPath $swapPath -Value 'attacker replacement'
        }
      }
      $afterCommit = $null
      if (-not [string]::IsNullOrWhiteSpace([string]$config.removeAfterCommit)) {
        $afterCommit = {
          param($publishedPaths)
          Remove-Item -LiteralPath $config.removeAfterCommit -Force -ErrorAction Stop
        }
      }
      $result = Invoke-BoundUpdaterReleasePublication -UpdaterStage $stage -NsisName $config.nsisName -FriendlyNsisName $config.friendlyNsisName -ManifestDestinationPaths @($config.manifestDestinationPaths) -ContainmentRoot $config.containmentRoot -BeforeDestinationMoveTestHook $beforeMove -AfterCommitBeforeReportTestHook $afterCommit
      [pscustomobject]@{
        Paths = @($result.Paths)
        ItemNames = @($result.Items | ForEach-Object { $_.Name })
      } | ConvertTo-Json -Depth 3 -Compress
    } finally {
      Close-BoundReleaseFile -Binding $stage.ManifestBinding
      Close-BoundReleaseFile -Binding $stage.SignatureBinding
      Close-BoundReleaseFile -Binding $stage.ArtifactBinding
      $stage.ManifestBinding = $null
      $stage.SignatureBinding = $null
      $stage.ArtifactBinding = $null
      Remove-OwnedUpdaterStage -Stage $stage -StageParent $config.stageParent -ContainmentRoot $config.containmentRoot
    }
  }
  'publishReleaseArtifacts' {
    Publish-ReleaseArtifactsTransactionally -Artifacts @($config.artifacts) -ContainmentRoot $config.containmentRoot -TestFailAfterBackup $config.testFailAfterBackup -TestFailAfterReplacement $config.testFailAfterReplacement | ConvertTo-Json -Compress
  }
  'publishCompleteRelease' {
    Publish-CompleteReleaseUnitTransactionally -Artifacts @($config.artifacts) -ManifestSourcePath $config.manifestSourcePath -ManifestDestinationPaths @($config.manifestDestinationPaths) -ContainmentRoot $config.containmentRoot -TestFailAfterReplacement $config.testFailAfterReplacement | ConvertTo-Json -Compress
  }
  'reportCommittedRelease' {
    @(Get-CommittedReleaseUnitItemsForReporting -Paths @($config.paths)) |
      ForEach-Object { $_.Name }
  }
  'cleanupSignatures' {
    Remove-CurrentVersionSignatures -ArtifactPaths @($config.artifactPaths) -BundleRoots @($config.bundleRoots)
  }
  'cleanupTransaction' {
    Remove-OwnedReleaseTransaction -TransactionPath $config.transactionPath -ContainmentRoot $config.containmentRoot -Label $config.label -Identity $config.identity -OwnedLeafNames @($config.ownedLeafNames)
  }
  default { throw "Unknown action: $Action" }
}
`;

async function withSandbox(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vibespace-release-windows-'));
  const sourceRoot = path.join(root, 'bundle', 'nsis');
  const containmentRoot = path.join(root, 'releases');
  const stageParent = path.join(containmentRoot, '.updater-staging');
  const harness = path.join(root, 'harness.ps1');
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(containmentRoot, { recursive: true });
  await writeFile(harness, harnessSource);
  try {
    await run({ containmentRoot, harness, root, sourceRoot, stageParent });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function runHarness(harness, action, config) {
  const configPath = path.join(path.dirname(harness), `config-${crypto.randomUUID()}.json`);
  await writeFile(configPath, JSON.stringify(config));
  try {
    return await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      harness,
      '-Source',
      releaseScript,
      '-Action',
      action,
      '-ConfigPath',
      configPath,
    ]);
  } finally {
    await rm(configPath, { force: true });
  }
}

async function addSignedArtifact(sourceRoot, name = canonicalName) {
  const artifactPath = path.join(sourceRoot, name);
  await writeFile(artifactPath, `artifact:${name}`);
  await writeFile(`${artifactPath}.sig`, signature);
  return artifactPath;
}

async function addCryptographicallySignedArtifact(sourceRoot, name = canonicalName) {
  const artifactPath = path.join(sourceRoot, name);
  const artifact = Buffer.from(`cryptographically signed artifact:${name}`, 'utf8');
  const keyId = Buffer.from('d3da96b5b101c53b', 'hex');
  const keyPair = generateKeyPairSync('ed25519');
  const rawPublicKey = Buffer.from(keyPair.publicKey.export({ format: 'jwk' }).x, 'base64url');
  const publicRecord = Buffer.concat([Buffer.from('Ed'), keyId, rawPublicKey]);
  const publicKey = Buffer.from(
    [
      'untrusted comment: minisign public key: 3BC501B1B596DAD3',
      publicRecord.toString('base64'),
      '',
    ].join('\n'),
    'utf8',
  ).toString('base64');
  const trustedComment = `timestamp:1785585600\tfile:${name}\thashed`;
  const messageSignature = signEd25519(
    null,
    createHash('blake2b512').update(artifact).digest(),
    keyPair.privateKey,
  );
  const globalSignature = signEd25519(
    null,
    Buffer.concat([messageSignature, Buffer.from(trustedComment, 'utf8')]),
    keyPair.privateKey,
  );
  const signatureRecord = Buffer.concat([Buffer.from('ED'), keyId, messageSignature]);
  const encodedSignature = Buffer.from(
    [
      'untrusted comment: signature from minisign secret key',
      signatureRecord.toString('base64'),
      `trusted comment: ${trustedComment}`,
      globalSignature.toString('base64'),
      '',
    ].join('\n'),
    'utf8',
  ).toString('base64');
  await writeFile(artifactPath, artifact);
  await writeFile(`${artifactPath}.sig`, encodedSignature);
  return { artifactPath, publicKey };
}

test('PowerShell AST is valid and updater publication is ordered after generator success', async () => {
  const source = await readFile(releaseScript, 'utf8');
  const check = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${releaseScript.replaceAll("'", "''")}',[ref]$t,[ref]$e);if($e.Count){exit 1}`,
  ]);
  assert.equal(check.stderr, '');
  assert.match(source, /New-ContainedUpdaterStage/u);
  assert.match(source, /--assets-dir\s+\$updaterStage\.Path/u);
  assert.match(source, /Publish-CompleteReleaseUnitTransactionally/u);
  assert.ok(
    source.lastIndexOf('if ($LASTEXITCODE -ne 0)') <
      source.lastIndexOf('Invoke-BoundUpdaterReleasePublication'),
    'complete publication follows the generator exit check',
  );
  assert.ok(
    source.lastIndexOf('New-ContainedUpdaterStage') <
      source.lastIndexOf('Invoke-BoundUpdaterReleasePublication'),
    'one updater stage is created before the complete publication unit',
  );
  assert.ok(
    source.lastIndexOf('New-ContainedUpdaterStage') <
      source.lastIndexOf('Invoke-BoundUpdaterSignatureVerification') &&
      source.lastIndexOf('Invoke-BoundUpdaterSignatureVerification') <
        source.lastIndexOf('& node $manifestScript'),
    'the retained staged generation is cryptographically verified before manifest generation',
  );
  assert.match(source, /SourcePath\s*=\s*\$UpdaterStage\.ArtifactPath/u);
  assert.match(source, /finally\s*\{[\s\S]*Remove-OwnedUpdaterStage/u);
  assert.ok(
    source.indexOf('Assert-ReleaseVersionPreflight -Version $Version') <
      source.indexOf('New-Item -ItemType Directory -Path $ReleasesDir'),
    'version and config parity are validated before release-root mutation',
  );
  assert.doesNotMatch(source, /Get-ChildItem[^\n]+-Filter '\*\.sig'/u);
});

test('retained updater stage cryptographically verifies before manifest publication', async () => {
  await withSandbox(async ({ containmentRoot, harness, sourceRoot, stageParent }) => {
    const { artifactPath, publicKey } = await addCryptographicallySignedArtifact(sourceRoot);
    const config = {
      artifactPath,
      containmentRoot,
      publicKey,
      sourceRoot,
      stageParent,
      verifierScriptPath: path.resolve('scripts/verify-updater-signature.mjs'),
      version,
    };

    const valid = await runHarness(harness, 'verifyStagedSignature', config);
    assert.match(valid.stdout, /updater signature verified/iu);
    assert.deepEqual(await readdir(stageParent), []);

    const otherKey = generateKeyPairSync('ed25519');
    const wrongPublicRecord = Buffer.concat([
      Buffer.from('Ed'),
      Buffer.from('d3da96b5b101c53b', 'hex'),
      Buffer.from(otherKey.publicKey.export({ format: 'jwk' }).x, 'base64url'),
    ]);
    const wrongPublicKey = Buffer.from(
      [
        'untrusted comment: minisign public key: 3BC501B1B596DAD3',
        wrongPublicRecord.toString('base64'),
        '',
      ].join('\n'),
      'utf8',
    ).toString('base64');
    await assert.rejects(
      runHarness(harness, 'verifyStagedSignature', {
        ...config,
        publicKey: wrongPublicKey,
      }),
      /artifact signature verification failed/iu,
    );

    await writeFile(artifactPath, 'tampered after signing');
    const freshSignatureTime = new Date(Date.now() + 2_000);
    await utimes(`${artifactPath}.sig`, freshSignatureTime, freshSignatureTime);
    await assert.rejects(
      runHarness(harness, 'verifyStagedSignature', config),
      /artifact signature verification failed/iu,
    );
    assert.deepEqual(await readdir(stageParent), []);
  });
});

test('accepts only canonical Tauri SemVer with exact package and Tauri parity', async () => {
  await withSandbox(async ({ harness, root }) => {
    const packageJsonPath = path.join(root, 'package.json');
    const tauriConfigPath = path.join(root, 'tauri.conf.json');
    const validate = (candidate) =>
      runHarness(harness, 'validate', {
        packageJsonPath,
        tauriConfigPath,
        version: candidate,
      });

    for (const candidate of ['0.0.0', '1.2.3-alpha.1+build.01']) {
      await writeFile(packageJsonPath, JSON.stringify({ version: candidate }));
      await writeFile(tauriConfigPath, JSON.stringify({ version: candidate }));
      assert.equal((await validate(candidate)).stdout.trim(), candidate);
    }

    for (const candidate of [
      '../2.3.4',
      '01.2.3',
      '1.2.3-01',
      '1.2.3-',
      '18446744073709551616.0.0',
    ]) {
      await writeFile(packageJsonPath, JSON.stringify({ version: candidate }));
      await writeFile(tauriConfigPath, JSON.stringify({ version: candidate }));
      await assert.rejects(validate(candidate), /canonical Tauri-compatible semantic version/u);
    }

    await writeFile(packageJsonPath, JSON.stringify({ version }));
    await writeFile(tauriConfigPath, JSON.stringify({ version: '2.3.5' }));
    await assert.rejects(validate(version), /version parity/u);
  });
});

test('isolates one canonical artifact so friendly root duplicates cannot affect URL selection', async () => {
  await withSandbox(async ({ containmentRoot, harness, sourceRoot, stageParent }) => {
    const artifactPath = await addSignedArtifact(sourceRoot);
    for (const name of [canonicalName, friendlyName]) {
      await writeFile(path.join(containmentRoot, name), `root:${name}`);
      await writeFile(path.join(containmentRoot, `${name}.sig`), signature);
    }

    const { stdout } = await runHarness(harness, 'stage', {
      artifactPath,
      containmentRoot,
      sourceRoot,
      stageParent,
      version,
    });
    const stage = JSON.parse(stdout.trim());
    assert.deepEqual((await readdir(stage.Path)).sort(), [canonicalName, `${canonicalName}.sig`]);

    await execFileAsync(process.execPath, [
      manifestScript,
      '--version',
      version,
      '--assets-dir',
      stage.Path,
      '--base-url',
      `https://example.test/releases/v${version}`,
      '--outfile',
      stage.ManifestPath,
      '--pub-date',
      '2026-07-30T20:15:30.000Z',
    ]);
    const manifest = JSON.parse(await readFile(stage.ManifestPath, 'utf8'));
    assert.equal(
      manifest.platforms['windows-x86_64'].url,
      `https://example.test/releases/v${version}/${canonicalName}`,
    );

    await runHarness(harness, 'cleanup', {
      artifactPath: stage.ArtifactPath,
      containmentRoot,
      identity: stage.Identity,
      manifestPath: stage.ManifestPath,
      signaturePath: stage.SignaturePath,
      stageParent,
      stagePath: stage.Path,
    });
    assert.deepEqual(await readdir(stageParent), []);
  });
});

test('refuses to recursively delete unexplained updater-stage content', async () => {
  await withSandbox(async ({ containmentRoot, harness, sourceRoot, stageParent }) => {
    const artifactPath = await addSignedArtifact(sourceRoot);
    const { stdout } = await runHarness(harness, 'stage', {
      artifactPath,
      containmentRoot,
      sourceRoot,
      stageParent,
      version,
    });
    const stage = JSON.parse(stdout.trim());
    const unexplainedPath = path.join(stage.Path, 'unexplained-user-file.txt');
    await writeFile(unexplainedPath, 'preserve me');

    await assert.rejects(
      runHarness(harness, 'cleanup', {
        artifactPath: stage.ArtifactPath,
        containmentRoot,
        identity: stage.Identity,
        manifestPath: stage.ManifestPath,
        signaturePath: stage.SignaturePath,
        stageParent,
        stagePath: stage.Path,
      }),
      /unexpected updater-stage content/u,
    );
    assert.equal(await readFile(unexplainedPath, 'utf8'), 'preserve me');
  });
});

test('rejects ambiguous bundle input before staging', async () => {
  await withSandbox(async ({ harness, sourceRoot }) => {
    await addSignedArtifact(sourceRoot);
    await addSignedArtifact(sourceRoot, `Jarvis One_${version}_x64-setup.exe`);
    await assert.rejects(
      runHarness(harness, 'resolve', {
        patterns: [canonicalName, `Jarvis One_${version}_x64-setup.exe`],
        sourceRoot,
      }),
      /Ambiguous bundle artifacts/u,
    );
  });
});

test('rejects missing, stale, and reparse-contained signatures without a partial stage', async () => {
  await withSandbox(async ({ containmentRoot, harness, root, sourceRoot, stageParent }) => {
    const artifactPath = path.join(sourceRoot, canonicalName);
    await writeFile(artifactPath, 'artifact');
    const config = { artifactPath, containmentRoot, sourceRoot, stageParent, version };
    await assert.rejects(runHarness(harness, 'stage', config), /signature/u);

    await writeFile(`${artifactPath}.sig`, signature);
    const old = new Date('2025-01-01T00:00:00.000Z');
    const fresh = new Date('2026-01-01T00:00:00.000Z');
    await utimes(`${artifactPath}.sig`, old, old);
    await utimes(artifactPath, fresh, fresh);
    await assert.rejects(runHarness(harness, 'stage', config), /stale/u);

    const realSource = path.join(root, 'real-source');
    const junctionSource = path.join(root, 'junction-source');
    await mkdir(realSource);
    const linkedArtifact = await addSignedArtifact(realSource);
    await symlink(realSource, junctionSource, 'junction');
    await assert.rejects(
      runHarness(harness, 'stage', {
        ...config,
        artifactPath: path.join(junctionSource, path.basename(linkedArtifact)),
        sourceRoot: junctionSource,
      }),
      /reparse/u,
    );

    await assert.rejects(readdir(stageParent), { code: 'ENOENT' });
  });
});

test('rejects hardlinked inputs and deterministic source swaps before staging bytes', async () => {
  await withSandbox(async ({ containmentRoot, harness, root, sourceRoot, stageParent }) => {
    const artifactPath = await addSignedArtifact(sourceRoot);
    const hardlinkPath = path.join(root, 'artifact-hardlink.exe');
    await link(artifactPath, hardlinkPath);
    const config = { artifactPath, containmentRoot, sourceRoot, stageParent, version };
    await assert.rejects(runHarness(harness, 'stage', config), /hard link/u);
    await rm(hardlinkPath);

    await assert.rejects(
      runHarness(harness, 'stageWithSwap', {
        ...config,
        swapPath: `${artifactPath}.sig`,
      }),
      /changed|process|access|sharing/u,
    );
    await assert.rejects(readdir(stageParent), { code: 'ENOENT' });
  });
});

test('retained stage bindings block artifact signature and manifest replacement through publication', async () => {
  await withSandbox(async ({ containmentRoot, harness, sourceRoot, stageParent }) => {
    const artifactPath = await addSignedArtifact(sourceRoot);
    const manifestDestinationPaths = [
      path.join(containmentRoot, 'latest.json'),
      path.join(containmentRoot, 'channel.json'),
      path.join(containmentRoot, 'manifests', `v${version}.json`),
    ];
    for (const swapKind of ['artifact', 'signature', 'manifest']) {
      await assert.rejects(
        runHarness(harness, 'publishBoundUpdaterRelease', {
          artifactPath,
          containmentRoot,
          friendlyNsisName: friendlyName,
          manifestDestinationPaths,
          manifestText: `{"version":"${version}"}\n`,
          nsisName: canonicalName,
          sourceRoot,
          stageParent,
          swapKind,
          version,
        }),
        /process|access|sharing/iu,
      );
    }
    assert.deepEqual(await readdir(stageParent), []);
    for (const destination of [
      path.join(containmentRoot, canonicalName),
      path.join(containmentRoot, `${canonicalName}.sig`),
      path.join(containmentRoot, friendlyName),
      path.join(containmentRoot, `${friendlyName}.sig`),
      ...manifestDestinationPaths,
    ]) {
      await assert.rejects(readFile(destination), { code: 'ENOENT' });
    }
  });
});

test('publishes a complete release asset set transactionally and rolls back injected failure', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const sourceDir = path.join(root, 'asset-source');
    await mkdir(sourceDir);
    const names = [canonicalName, `${canonicalName}.sig`, friendlyName, `${friendlyName}.sig`];
    const assets = [];
    for (const name of names) {
      const sourcePath = path.join(sourceDir, name);
      await writeFile(sourcePath, `new:${name}`);
      await writeFile(path.join(containmentRoot, name), `old:${name}`);
      assets.push({ sourcePath, destinationName: name });
    }

    await assert.rejects(
      runHarness(harness, 'publishAssets', {
        assets,
        containmentRoot,
        testFailAfterReplacement: 1,
      }),
      /injected release asset publication failure/u,
    );
    for (const name of names) {
      assert.equal(await readFile(path.join(containmentRoot, name), 'utf8'), `old:${name}`);
    }

    await runHarness(harness, 'publishAssets', {
      assets,
      containmentRoot,
      testFailAfterReplacement: -1,
    });
    for (const name of names) {
      assert.equal(await readFile(path.join(containmentRoot, name), 'utf8'), `new:${name}`);
    }
  });
});

test('restores a known-good target when failure occurs after backup but before replacement', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const sourcePath = path.join(root, 'new.exe');
    const targetPath = path.join(containmentRoot, canonicalName);
    await writeFile(sourcePath, 'new');
    await writeFile(targetPath, 'known good');

    await assert.rejects(
      runHarness(harness, 'publishAssets', {
        assets: [{ sourcePath, destinationName: canonicalName }],
        containmentRoot,
        testFailAfterBackup: 1,
        testFailAfterReplacement: -1,
      }),
      /injected release asset backup failure/u,
    );
    assert.equal(await readFile(targetPath, 'utf8'), 'known good');
    assert.deepEqual(
      (await readdir(containmentRoot)).filter((name) => name.startsWith('.release asset-')),
      [],
    );
  });
});

test('rejects same-size prior-target byte mutation even when its write time is restored', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const sourcePath = path.join(root, 'new-hash-bound.exe');
    const targetPath = path.join(containmentRoot, canonicalName);
    await writeFile(sourcePath, 'new release bytes');
    await writeFile(targetPath, 'known-good-00000');

    await assert.rejects(
      runHarness(harness, 'publishAssetsWithPriorMutation', {
        assets: [{ sourcePath, destinationName: canonicalName }],
        containmentRoot,
        mutatePath: targetPath,
        mutateValue: 'attacker---00000',
      }),
      /changed after validation/u,
    );
    assert.equal(await readFile(targetPath, 'utf8'), 'attacker---00000');
    assert.notEqual(await readFile(targetPath, 'utf8'), 'new release bytes');
  });
});

test('restores prior targets and removes no-prior targets when failure occurs after move before bind', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const sourcePath = path.join(root, 'move-gap-new.exe');
    const priorTarget = path.join(containmentRoot, canonicalName);
    const noPriorName = 'VibeSpace-move-gap-no-prior.exe';
    const noPriorTarget = path.join(containmentRoot, noPriorName);
    await writeFile(sourcePath, 'new move-gap bytes');
    await writeFile(priorTarget, 'known-good prior bytes');

    await assert.rejects(
      runHarness(harness, 'publishAssets', {
        assets: [{ sourcePath, destinationName: canonicalName }],
        containmentRoot,
        testFailAfterBackup: -1,
        testFailAfterMoveBeforeBind: 1,
        testFailAfterReplacement: -1,
      }),
      /injected release asset move-before-bind failure/u,
    );
    assert.equal(await readFile(priorTarget, 'utf8'), 'known-good prior bytes');

    await assert.rejects(
      runHarness(harness, 'publishAssets', {
        assets: [{ sourcePath, destinationName: noPriorName }],
        containmentRoot,
        testFailAfterBackup: -1,
        testFailAfterMoveBeforeBind: 1,
        testFailAfterReplacement: -1,
      }),
      /injected release asset move-before-bind failure/u,
    );
    await assert.rejects(readFile(noPriorTarget), { code: 'ENOENT' });
  });
});

test('detects a release-root junction swap at the final move boundary without writing outside', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const sourcePath = path.join(root, 'root-swap-source.exe');
    const displacedRoot = path.join(root, 'releases-displaced');
    const hookMarker = path.join(root, 'root-swap-hook.txt');
    await writeFile(sourcePath, 'new bytes');

    try {
      await assert.rejects(
        runHarness(harness, 'publishAssetsWithRootSwap', {
          assets: [{ sourcePath, destinationName: canonicalName }],
          containmentRoot,
          displacedRoot,
          hookMarker,
        }),
        /publication failed|process cannot access|being used by another process|access.*denied|sharing/iu,
      );
      assert.match(
        (await readFile(hookMarker, 'utf8')).trim(),
        /^before-move\r?\nmove-error:.*(?:process cannot access|being used by another process|access.*denied|sharing)/iu,
      );
    } finally {
      const currentRoot = await lstat(containmentRoot);
      if (currentRoot.isSymbolicLink()) {
        await rm(containmentRoot, { force: true });
        await rename(displacedRoot, containmentRoot);
      }
    }
    await assert.rejects(readFile(path.join(containmentRoot, canonicalName)), { code: 'ENOENT' });
  });
});

test('pins a nested destination parent against junction redirection before publication', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const sourcePath = path.join(root, 'nested-manifest-source.json');
    const destinationParent = path.join(containmentRoot, 'manifests');
    const destinationPath = path.join(destinationParent, `v${version}.json`);
    const displacedParent = path.join(root, 'manifests-displaced');
    const outsideParent = path.join(root, 'outside-manifests');
    const hookMarker = path.join(root, 'parent-swap-hook.txt');
    await writeFile(sourcePath, '{"version":"new"}\n');
    await mkdir(destinationParent);
    await mkdir(outsideParent);
    await writeFile(destinationPath, '{"version":"old"}\n');

    try {
      await assert.rejects(
        runHarness(harness, 'publishNestedWithParentSwap', {
          containmentRoot,
          destinationParent,
          destinationPath,
          displacedParent,
          hookMarker,
          outsideParent,
          sourcePath,
        }),
        /process cannot access|being used by another process|access.*denied|sharing/iu,
      );
      assert.match(
        (await readFile(hookMarker, 'utf8')).trim(),
        /^before-move\r?\nmove-error:.*(?:process cannot access|being used by another process|access.*denied|sharing)/iu,
      );
      assert.deepEqual(await readdir(outsideParent), []);
    } finally {
      const currentParent = await lstat(destinationParent);
      if (currentParent.isSymbolicLink()) {
        await rm(destinationParent, { force: true });
        await rename(displacedParent, destinationParent);
      }
    }
    assert.equal(await readFile(destinationPath, 'utf8'), '{"version":"old"}\n');
  });
});

test('journals live source and prior hashes across prepared and committed transitions', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const sourcePath = path.join(root, 'journal-source.json');
    const destinationPath = path.join(containmentRoot, 'journal-target.json');
    const preparedSnapshot = path.join(root, 'journal-prepared.snapshot.json');
    const committedSnapshot = path.join(root, 'journal-committed.snapshot.json');
    const previousSnapshot = path.join(root, 'journal-previous.snapshot.json');
    const sourceBytes = '{"version":"new"}\n';
    const priorBytes = '{"version":"old"}\n';
    await writeFile(sourcePath, sourceBytes);
    await writeFile(destinationPath, priorBytes);

    await runHarness(harness, 'publishWithJournalSnapshots', {
      committedSnapshot,
      containmentRoot,
      destinationPath,
      preparedSnapshot,
      previousSnapshot,
      sourcePath,
    });

    const prepared = JSON.parse(await readFile(preparedSnapshot, 'utf8'));
    const committed = JSON.parse(await readFile(committedSnapshot, 'utf8'));
    const previous = JSON.parse(await readFile(previousSnapshot, 'utf8'));
    assert.equal(prepared.state, 'prepared');
    assert.equal(committed.state, 'committed');
    assert.deepEqual(previous, prepared);
    assert.equal(
      prepared.entries[0].sourceSha256,
      createHash('sha256').update(sourceBytes).digest('base64'),
    );
    assert.equal(
      prepared.entries[0].priorSha256,
      createHash('sha256').update(priorBytes).digest('base64'),
    );
    assert.equal(await readFile(destinationPath, 'utf8'), sourceBytes);
  });
});

test('transaction cleanup preserves unexpected content instead of deleting recursively', async () => {
  await withSandbox(async ({ containmentRoot, harness }) => {
    const identity = 'a'.repeat(32);
    const label = 'release asset';
    const transactionPath = path.join(containmentRoot, `.${label}-transaction-${identity}`);
    const ownedPath = path.join(transactionPath, 'new-0');
    const unexplainedPath = path.join(transactionPath, 'unexplained-user-file.txt');
    await mkdir(transactionPath);
    await writeFile(ownedPath, 'owned');
    await writeFile(unexplainedPath, 'preserve me');

    await assert.rejects(
      runHarness(harness, 'cleanupTransaction', {
        containmentRoot,
        identity,
        label,
        ownedLeafNames: ['new-0', 'old-0'],
        transactionPath,
      }),
      /unexpected release transaction content/u,
    );
    assert.equal(await readFile(ownedPath, 'utf8'), 'owned');
    assert.equal(await readFile(unexplainedPath, 'utf8'), 'preserve me');
  });
});

test('fails closed before publication when a prior crash transaction awaits recovery admission', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const identity = 'b'.repeat(32);
    const transactionPath = path.join(containmentRoot, `.complete release-transaction-${identity}`);
    const sourcePath = path.join(root, 'new-after-crash.exe');
    const targetPath = path.join(containmentRoot, canonicalName);
    await mkdir(transactionPath);
    await writeFile(
      path.join(transactionPath, 'journal.json'),
      JSON.stringify({
        schemaVersion: 'vibespace.release-transaction.v1',
        identity,
        label: 'complete release',
        state: 'prepared',
        entries: [{ destination: targetPath, hadExisting: true }],
      }),
    );
    await writeFile(sourcePath, 'new');
    await writeFile(targetPath, 'known-good');

    await assert.rejects(
      runHarness(harness, 'publishAssets', {
        assets: [{ sourcePath, destinationName: canonicalName }],
        containmentRoot,
        testFailAfterBackup: -1,
        testFailAfterReplacement: -1,
      }),
      /Pending release transaction requires recovery admission/u,
    );
    assert.equal(await readFile(targetPath, 'utf8'), 'known-good');
    assert.ok((await readdir(transactionPath)).includes('journal.json'));
  });
});

test('publishes canonical and friendly installers with their exact signatures as one transaction', async () => {
  await withSandbox(async ({ containmentRoot, harness, sourceRoot }) => {
    const artifactPath = await addSignedArtifact(sourceRoot);
    const names = [canonicalName, `${canonicalName}.sig`, friendlyName, `${friendlyName}.sig`];
    for (const name of names) {
      await writeFile(path.join(containmentRoot, name), `old:${name}`);
    }
    const config = {
      artifacts: [{ sourcePath: artifactPath, canonicalName, friendlyName }],
      containmentRoot,
    };

    await assert.rejects(
      runHarness(harness, 'publishReleaseArtifacts', {
        ...config,
        testFailAfterReplacement: 1,
      }),
      /injected release asset publication failure/u,
    );
    for (const name of names) {
      assert.equal(await readFile(path.join(containmentRoot, name), 'utf8'), `old:${name}`);
    }

    const { stdout } = await runHarness(harness, 'publishReleaseArtifacts', {
      ...config,
      testFailAfterReplacement: -1,
    });
    assert.deepEqual(
      JSON.parse(stdout.trim()).sort(),
      names.map((name) => path.join(containmentRoot, name)).sort(),
    );
    assert.equal(
      await readFile(path.join(containmentRoot, canonicalName), 'utf8'),
      `artifact:${canonicalName}`,
    );
    assert.equal(
      await readFile(path.join(containmentRoot, friendlyName), 'utf8'),
      `artifact:${canonicalName}`,
    );
    assert.equal(
      await readFile(path.join(containmentRoot, `${canonicalName}.sig`), 'utf8'),
      signature,
    );
    assert.equal(
      await readFile(path.join(containmentRoot, `${friendlyName}.sig`), 'utf8'),
      signature,
    );
  });
});

test('publishes signed root assets and all updater manifests as one rollback unit', async () => {
  await withSandbox(async ({ containmentRoot, harness, sourceRoot }) => {
    const artifactPath = await addSignedArtifact(sourceRoot);
    const manifestSourcePath = path.join(sourceRoot, 'generated-latest.json');
    await writeFile(manifestSourcePath, '{"version":"2.3.4"}\n');
    const assetNames = [canonicalName, `${canonicalName}.sig`, friendlyName, `${friendlyName}.sig`];
    const manifestDestinationPaths = [
      path.join(containmentRoot, 'latest.json'),
      path.join(containmentRoot, 'channel.json'),
      path.join(containmentRoot, 'manifests', `v${version}.json`),
    ];
    await mkdir(path.dirname(manifestDestinationPaths[2]), { recursive: true });
    for (const name of assetNames) {
      await writeFile(path.join(containmentRoot, name), `old:${name}`);
    }
    for (const destination of manifestDestinationPaths) {
      await writeFile(destination, '{"version":"old"}\n');
    }
    const config = {
      artifacts: [{ sourcePath: artifactPath, canonicalName, friendlyName }],
      containmentRoot,
      manifestDestinationPaths,
      manifestSourcePath,
    };

    await assert.rejects(
      runHarness(harness, 'publishCompleteRelease', {
        ...config,
        testFailAfterReplacement: 2,
      }),
      /injected complete release publication failure/u,
    );
    for (const name of assetNames) {
      assert.equal(await readFile(path.join(containmentRoot, name), 'utf8'), `old:${name}`);
    }
    for (const destination of manifestDestinationPaths) {
      assert.equal(await readFile(destination, 'utf8'), '{"version":"old"}\n');
    }

    const { stdout } = await runHarness(harness, 'publishCompleteRelease', {
      ...config,
      testFailAfterReplacement: -1,
    });
    assert.deepEqual(
      JSON.parse(stdout.trim()).sort(),
      [
        ...assetNames.map((name) => path.join(containmentRoot, name)),
        ...manifestDestinationPaths,
      ].sort(),
    );
    for (const destination of manifestDestinationPaths) {
      assert.equal(await readFile(destination, 'utf8'), '{"version":"2.3.4"}\n');
    }
  });
});

test('keeps the main bound publication path successful when one committed output disappears before reporting', async () => {
  await withSandbox(async ({ containmentRoot, harness, sourceRoot, stageParent }) => {
    const artifactPath = await addSignedArtifact(sourceRoot);
    const removedAfterCommit = path.join(containmentRoot, canonicalName);
    const manifestDestinationPaths = [
      path.join(containmentRoot, 'latest.json'),
      path.join(containmentRoot, 'channel.json'),
      path.join(containmentRoot, 'manifests', `v${version}.json`),
    ];
    const { stdout } = await runHarness(harness, 'publishBoundUpdaterRelease', {
      artifactPath,
      containmentRoot,
      friendlyNsisName: friendlyName,
      manifestDestinationPaths,
      manifestText: `{"version":"${version}"}\n`,
      nsisName: canonicalName,
      removeAfterCommit: removedAfterCommit,
      sourceRoot,
      stageParent,
      version,
    });

    assert.match(
      stdout,
      /Release unit is committed; one published output could not be inspected for reporting/u,
    );
    assert.match(stdout, /Committed signed root assets and all updater manifests/u);
    await assert.rejects(readFile(removedAfterCommit), { code: 'ENOENT' });
    assert.equal(
      await readFile(path.join(containmentRoot, friendlyName), 'utf8'),
      `artifact:${canonicalName}`,
    );
    for (const destination of manifestDestinationPaths) {
      assert.equal(await readFile(destination, 'utf8'), `{"version":"${version}"}\n`);
    }
    assert.deepEqual(await readdir(stageParent), []);
  });
});

test('rejects missing or stale release signatures before replacing any root asset', async () => {
  await withSandbox(async ({ containmentRoot, harness, sourceRoot }) => {
    const artifactPath = path.join(sourceRoot, canonicalName);
    const targetPath = path.join(containmentRoot, canonicalName);
    await writeFile(artifactPath, 'new artifact');
    await writeFile(targetPath, 'known good artifact');
    const config = {
      artifacts: [{ sourcePath: artifactPath, canonicalName, friendlyName }],
      containmentRoot,
      testFailAfterReplacement: -1,
    };

    await assert.rejects(runHarness(harness, 'publishReleaseArtifacts', config), /signature/u);
    assert.equal(await readFile(targetPath, 'utf8'), 'known good artifact');

    await writeFile(`${artifactPath}.sig`, signature);
    const old = new Date('2025-01-01T00:00:00.000Z');
    const fresh = new Date('2026-01-01T00:00:00.000Z');
    await utimes(`${artifactPath}.sig`, old, old);
    await utimes(artifactPath, fresh, fresh);
    await assert.rejects(runHarness(harness, 'publishReleaseArtifacts', config), /stale/u);
    assert.equal(await readFile(targetPath, 'utf8'), 'known good artifact');
  });
});

test('rejects hardlinked release targets without mutating the known-good asset set', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const sourcePath = path.join(root, 'new.exe');
    const targetPath = path.join(containmentRoot, canonicalName);
    const outsideLink = path.join(root, 'outside-link.exe');
    await writeFile(sourcePath, 'new');
    await writeFile(targetPath, 'old');
    await link(targetPath, outsideLink);

    await assert.rejects(
      runHarness(harness, 'publishAssets', {
        assets: [{ sourcePath, destinationName: canonicalName }],
        containmentRoot,
        testFailAfterReplacement: -1,
      }),
      /hard link/u,
    );
    assert.equal(await readFile(targetPath, 'utf8'), 'old');
    assert.equal(await readFile(outsideLink, 'utf8'), 'old');
  });
});

test('publishes all intended manifests only from a successful generated source', async () => {
  await withSandbox(async ({ containmentRoot, harness, root }) => {
    const generated = path.join(root, 'generated.json');
    const destinations = [
      path.join(containmentRoot, 'latest.json'),
      path.join(containmentRoot, 'channel.json'),
      path.join(containmentRoot, 'manifests', `v${version}.json`),
    ];
    await writeFile(generated, '{"version":"2.3.4"}\n');
    await mkdir(path.dirname(destinations[2]), { recursive: true });
    for (const destination of destinations) {
      await writeFile(destination, '{"version":"old"}\n');
    }
    await runHarness(harness, 'publish', {
      containmentRoot,
      destinationPaths: destinations,
      sourcePath: generated,
    });
    for (const destination of destinations) {
      assert.equal(await readFile(destination, 'utf8'), '{"version":"2.3.4"}\n');
    }

    await assert.rejects(
      runHarness(harness, 'publish', {
        containmentRoot,
        destinationPaths: destinations,
        sourcePath: path.join(root, 'missing.json'),
      }),
      /generated updater manifest|Cannot find path/u,
    );
    for (const destination of destinations) {
      assert.equal(await readFile(destination, 'utf8'), '{"version":"2.3.4"}\n');
    }

    await writeFile(generated, '{"version":"2.3.5"}\n');
    await assert.rejects(
      runHarness(harness, 'publish', {
        containmentRoot,
        destinationPaths: destinations,
        sourcePath: generated,
        testFailAfterReplacement: 1,
      }),
      /injected manifest publication failure/u,
    );
    for (const destination of destinations) {
      assert.equal(await readFile(destination, 'utf8'), '{"version":"2.3.4"}\n');
    }
  });
});

test('cleans only exact current-version signatures and preserves unrelated bundle signatures', async () => {
  await withSandbox(async ({ harness, sourceRoot }) => {
    const currentArtifact = path.join(sourceRoot, canonicalName);
    const unrelatedArtifact = path.join(sourceRoot, 'VibeSpace_9.9.9_x64-setup.exe');
    await writeFile(`${currentArtifact}.sig`, 'current');
    await writeFile(`${unrelatedArtifact}.sig`, 'unrelated');

    await runHarness(harness, 'cleanupSignatures', {
      artifactPaths: [currentArtifact],
      bundleRoots: [sourceRoot],
    });

    await assert.rejects(readFile(`${currentArtifact}.sig`), { code: 'ENOENT' });
    assert.equal(await readFile(`${unrelatedArtifact}.sig`, 'utf8'), 'unrelated');
  });
});
