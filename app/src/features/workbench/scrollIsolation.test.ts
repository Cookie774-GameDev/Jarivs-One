import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function findWheelIsolationGuard(source: string): ts.IfStatement | undefined {
  const file = ts.createSourceFile(
    'WorkbenchCanvas.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let guard: ts.IfStatement | undefined;

  const containsPanelBodyClosest = (node: ts.Node): boolean => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'closest' &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text
        .split(',')
        .map((selector) => selector.trim())
        .includes('.workbench-panel-body')
    ) {
      return true;
    }
    return node.getChildren(file).some(containsPanelBodyClosest);
  };

  const findGuard = (node: ts.Node): void => {
    if (
      !guard &&
      ts.isIfStatement(node) &&
      containsPanelBodyClosest(node.expression) &&
      ts.isBlock(node.thenStatement) &&
      node.thenStatement.statements.some(ts.isReturnStatement)
    ) {
      guard = node;
      return;
    }
    ts.forEachChild(node, findGuard);
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'onWheel' &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression
    ) {
      findGuard(node.initializer.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return guard;
}

describe('Workbench scroll isolation', () => {
  it('canvas wheel handler ignores events from panel bodies', () => {
    const src = readFileSync(join(__dirname, 'WorkbenchCanvas.tsx'), 'utf8');
    expect(findWheelIsolationGuard(src)).toBeDefined();
  });

  it('panel body stops wheel propagation', () => {
    const src = readFileSync(join(__dirname, 'WorkbenchPanel.tsx'), 'utf8');
    expect(src).toMatch(/workbench-panel-body/);
    expect(src).toMatch(/stopPropagation/);
  });
});
