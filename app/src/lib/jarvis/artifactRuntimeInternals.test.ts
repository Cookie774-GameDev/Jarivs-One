import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { JarvisArtifactDraft } from './contracts/execution';
import { createJarvisArtifactRuntimeInternals } from './artifactRuntimeInternals';

const NOW = 1_786_200_200_000;

function draft(content = 'verified output'): JarvisArtifactDraft {
  return {
    artifact: {
      kind: 'provider_result',
      title: 'Provider output',
      mimeType: 'text/plain',
      safeSummary: 'Synthetic verified output.',
      sourceRefs: [],
      createdAt: NOW,
    },
    backing: { kind: 'producer_result', content },
  };
}

function binding(resultRef = 'provider-result-alpha') {
  return {
    accountId: 'account-alpha',
    runId: 'run-alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    producerId: 'provider_response' as const,
    resultRef,
    verifiedAt: NOW,
  };
}

describe('artifact runtime internals', () => {
  it('alone mints IDs, materializes a verified artifact, and consumes exact object identity once', async () => {
    const uuids = ['artifact-alpha', 'receipt-alpha'];
    const runtime = createJarvisArtifactRuntimeInternals({
      randomUUID: vi.fn(() => uuids.shift() ?? 'unexpected'),
      now: () => NOW,
    });
    const artifact = await runtime.materializeVerified({ binding: binding(), draft: draft() });

    expect(artifact.id).toBe('jart_artifact-alpha');
    expect(artifact).not.toHaveProperty('receipt');
    expect(artifact).not.toHaveProperty('verified');
    expect(artifact).not.toHaveProperty('producerId');
    expect(artifact).not.toHaveProperty('artifactDigest');

    const scope = {
      accountId: 'account-alpha',
      runId: 'run-alpha',
      requestId: 'request-alpha',
      attemptNumber: 1,
      artifacts: [artifact],
    };
    expect(() => runtime.consumePendingForCommit(scope)).not.toThrow();
    expect(() => runtime.consumePendingForCommit(scope)).toThrow('artifact_commit_not_pending');
  });

  it('rejects cloned identity, scope substitution, and duplicate array identity atomically', async () => {
    let counter = 0;
    const runtime = createJarvisArtifactRuntimeInternals({
      randomUUID: () => `uuid-${++counter}`,
      now: () => NOW,
    });
    const artifact = await runtime.materializeVerified({ binding: binding(), draft: draft() });
    const base = {
      accountId: 'account-alpha',
      runId: 'run-alpha',
      requestId: 'request-alpha',
      attemptNumber: 1,
    };

    expect(() =>
      runtime.consumePendingForCommit({ ...base, artifacts: [structuredClone(artifact)] }),
    ).toThrow('artifact_commit_not_pending');
    expect(() =>
      runtime.consumePendingForCommit({ ...base, runId: 'run-beta', artifacts: [artifact] }),
    ).toThrow('artifact_commit_scope_mismatch');
    expect(() =>
      runtime.consumePendingForCommit({ ...base, artifacts: [artifact, artifact] }),
    ).toThrow('artifact_commit_duplicate');
    expect(() => runtime.consumePendingForCommit({ ...base, artifacts: [artifact] })).not.toThrow();
  });

  it('serializes concurrent work for one producer result and mints independent artifacts', async () => {
    let counter = 0;
    const runtime = createJarvisArtifactRuntimeInternals({
      randomUUID: () => `serial-${++counter}`,
      now: () => NOW,
    });
    const [first, second] = await Promise.all([
      runtime.materializeVerified({ binding: binding(), draft: draft('first') }),
      runtime.materializeVerified({ binding: binding(), draft: draft('second') }),
    ]);
    expect(first.id).not.toBe(second.id);
    expect(first.contentHash).not.toBe(second.contentHash);
    expect(counter).toBe(4);
  });

  it('leaves no commit eligibility after canonicalization or receipt failures', async () => {
    let calls = 0;
    const runtime = createJarvisArtifactRuntimeInternals({
      randomUUID: () => {
        calls += 1;
        if (calls === 2) throw new Error('synthetic receipt failure');
        return `failure-${calls}`;
      },
      now: () => NOW,
    });
    await expect(
      runtime.materializeVerified({ binding: binding(), draft: draft() }),
    ).rejects.toThrow('synthetic receipt failure');

    const invalidDraft = draft('password=hunter2-real-value');
    await expect(
      runtime.materializeVerified({
        binding: binding('provider-result-beta'),
        draft: invalidDraft,
      }),
    ).rejects.toThrow('artifact_secret_rejected');
  });
});

describe('artifact internal import ladder', () => {
  const jarvisDir = resolve(process.cwd(), 'src/lib/jarvis');

  function productionTypeScriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return productionTypeScriptFiles(path);
      return /\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)
        ? [path]
        : [];
    });
  }

  it('allows the normalizer exactly one receipt type-only import with two named types', () => {
    const fileName = resolve(jarvisDir, 'artifactNormalizer.ts');
    const source = ts.createSourceFile(
      fileName,
      readFileSync(fileName, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const declarations = source.statements.filter(
      (statement): statement is ts.ImportDeclaration =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === './artifactReceipts',
    );
    expect(declarations).toHaveLength(1);
    const clause = declarations[0]!.importClause;
    expect(clause?.isTypeOnly).toBe(true);
    expect(clause?.namedBindings && ts.isNamedImports(clause.namedBindings)).toBe(true);
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
    expect(clause.namedBindings.elements.map((element) => element.name.text).sort()).toEqual([
      'ArtifactPreDigestBinding',
      'VerifiedArtifactBinding',
    ]);
  });

  it('keeps receipt, material, and runtime internals out of the public barrel', () => {
    const barrel = readFileSync(resolve(jarvisDir, 'contracts/index.ts'), 'utf8');
    for (const forbidden of [
      'ArtifactReceiptBinding',
      'ArtifactVerificationReceipt',
      'VerifiedArtifactBinding',
      'CanonicalArtifactMaterial',
      'createArtifactReceiptAuthority',
      'canonicalizeArtifactDraftInternal',
      'normalizeVerifiedArtifactInternal',
      'createJarvisArtifactRuntimeInternals',
      'consumePendingForCommit',
    ]) {
      expect(barrel).not.toContain(forbidden);
    }
  });

  it('rejects every production import, re-export, or import query outside the strict ladder', () => {
    const allowed = new Map<string, ReadonlySet<string>>([
      ['artifactNormalizer.ts', new Set(['./artifactReceipts'])],
      ['artifactRuntimeInternals.ts', new Set(['./artifactReceipts', './artifactNormalizer'])],
      ['artifactRuntime.ts', new Set(['./artifactRuntimeInternals'])],
    ]);
    const internalModule =
      /(?:artifactReceipts|artifactNormalizer|artifactRuntimeInternals)(?:\.tsx?)?$/;

    for (const fileName of productionTypeScriptFiles(resolve(process.cwd(), 'src'))) {
      const text = readFileSync(fileName, 'utf8');
      if (!/(?:artifactReceipts|artifactNormalizer|artifactRuntimeInternals)/.test(text)) continue;
      const source = ts.createSourceFile(
        fileName,
        text,
        ts.ScriptTarget.Latest,
        true,
        fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const owner = basename(fileName);
      const allowedModules = allowed.get(owner) ?? new Set<string>();
      const visit = (node: ts.Node): void => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          internalModule.test(node.moduleSpecifier.text)
        ) {
          expect(allowedModules.has(node.moduleSpecifier.text), `${owner}: ${node.getText()}`).toBe(
            true,
          );
          if (
            owner === 'artifactRuntime.ts' &&
            ts.isImportDeclaration(node) &&
            node.moduleSpecifier.text === './artifactRuntimeInternals'
          ) {
            const clause = node.importClause;
            expect(clause?.namedBindings && ts.isNamedImports(clause.namedBindings)).toBe(true);
            if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
              expect(
                clause.namedBindings.elements.map((element) => element.name.text).sort(),
              ).toEqual(['JarvisArtifactRuntimeInternals', 'createJarvisArtifactRuntimeInternals']);
            }
          }
        }
        if (ts.isImportTypeNode(node)) {
          const argument = node.argument;
          if (
            ts.isLiteralTypeNode(argument) &&
            ts.isStringLiteral(argument.literal) &&
            internalModule.test(argument.literal.text)
          ) {
            throw new Error(`${owner}: import type query bypass`);
          }
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0]!) &&
          internalModule.test(node.arguments[0]!.text)
        ) {
          throw new Error(`${owner}: dynamic import bypass`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  });
});
