import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, posix, relative, resolve } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('../../app/node_modules/typescript');
const repositoryRoot = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(repositoryRoot, 'app/src');
const manifestPath = resolve(import.meta.dirname, 'manifests/motion.json');
const schemaPath = resolve(import.meta.dirname, 'manifests/motion.schema.json');
const THEME_MOTION_MODULE = '@/features/appearance/themeMotion';
const APPROVED_SEMANTIC_EXCEPTIONS = Object.freeze([]);
const APPROVED_TRANSITION_ADAPTERS = Object.freeze({
  resolveDropdownMotion: Object.freeze({
    moduleSpecifier: './dropdownMotion',
    path: 'app/src/features/chat/dropdownMotion.ts',
    transitionParameter: 1,
  }),
});
const sourceAnalysisCache = new Map();

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function slash(path) {
  return path.replaceAll('\\', '/');
}

function productionSources(directory = sourceRoot) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return productionSources(path);
      if (!['.ts', '.tsx', '.mts', '.cts'].includes(extname(entry.name))) return [];
      if (
        /\.(?:test|spec)\.[^.]+$/u.test(entry.name) ||
        ['.d.ts', '.d.mts', '.d.cts'].some((suffix) => entry.name.endsWith(suffix))
      ) {
        return [];
      }
      return [path];
    })
    .sort();
}

function unwrapExpression(expression) {
  if (!expression) return undefined;
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function createSourceAnalysis(source, path) {
  const cached = sourceAnalysisCache.get(path);
  if (cached?.source === source) return cached.analysis;

  const fileName = resolve(repositoryRoot, ...path.split('/'));
  const scriptKind = extname(path) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const options = {
    target: ts.ScriptTarget.Latest,
    jsx: ts.JsxEmit.Preserve,
    noLib: true,
    noResolve: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const canonicalFileName = slash(host.getCanonicalFileName(fileName));
  const isSourceFile = (candidate) =>
    slash(host.getCanonicalFileName(candidate)) === canonicalFileName;
  host.fileExists = isSourceFile;
  host.readFile = (candidate) => (isSourceFile(candidate) ? source : undefined);
  host.getSourceFile = (candidate) => (isSourceFile(candidate) ? sourceFile : undefined);
  const program = ts.createProgram([fileName], options, host);
  const analysis = {
    checker: program.getTypeChecker(),
    sourceFile: program.getSourceFile(fileName) ?? sourceFile,
  };
  sourceAnalysisCache.set(path, { source, analysis });
  return analysis;
}

function isConstVariable(declaration) {
  return (
    ts.isVariableDeclaration(declaration) &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  );
}

function variableDeclarationForSymbol(symbol) {
  const declarations = (symbol?.declarations ?? []).filter(
    (declaration) => ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name),
  );
  return declarations.length === 1 ? declarations[0] : undefined;
}

function resolvePrimitiveSymbol(symbol, analysis, seen, context) {
  if (!symbol || (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    throw new Error(`unresolved identifier in ${context}`);
  }
  if (seen.has(symbol)) throw new Error(`unresolved circular identifier in ${context}`);
  const declaration = variableDeclarationForSymbol(symbol);
  if (!declaration?.initializer) throw new Error(`unresolved identifier in ${context}`);
  if (!isConstVariable(declaration)) {
    throw new Error(`mutable identifier in ${context}`);
  }
  seen.add(symbol);
  const value = resolvePrimitive(declaration.initializer, analysis, seen, context);
  seen.delete(symbol);
  return value;
}

function resolvePrimitive(expression, analysis, seen = new Set(), context = 'constant expression') {
  if (!expression) throw new Error(`unresolved value in ${context}`);
  const current = unwrapExpression(expression);
  if (ts.isStringLiteralLike(current) || ts.isNumericLiteral(current)) {
    return ts.isNumericLiteral(current) ? Number(current.text) : current.text;
  }
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (current.kind === ts.SyntaxKind.NullKeyword) return null;
  if (
    ts.isPrefixUnaryExpression(current) &&
    current.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(current.operand)
  ) {
    return -Number(current.operand.text);
  }
  if (ts.isIdentifier(current)) {
    return resolvePrimitiveSymbol(
      analysis.checker.getSymbolAtLocation(current),
      analysis,
      seen,
      context,
    );
  }
  throw new Error(`unresolved expression in ${context}`);
}

function resolvePropertyName(name, analysis, context) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    return resolvePrimitive(name.expression, analysis, new Set(), context);
  }
  throw new Error(`unresolved property name in ${context}`);
}

function resolvePropertyValue(property, analysis, context) {
  if (ts.isPropertyAssignment(property)) {
    return resolvePrimitive(property.initializer, analysis, new Set(), context);
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    const symbol =
      analysis.checker.getShorthandAssignmentValueSymbol(property) ??
      analysis.checker.getSymbolAtLocation(property.name);
    return resolvePrimitiveSymbol(symbol, analysis, new Set(), context);
  }
  throw new Error(`unresolved property value in ${context}`);
}

function findVariableDeclaration(node) {
  let current = node;
  while (current && !ts.isStatement(current)) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function discoverSprings(source, path) {
  const analysis = createSourceAnalysis(source, path);
  const { sourceFile } = analysis;
  const discovered = [];

  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const properties = new Map();
      let unresolvedPropertyName = false;
      let hasSpread = false;
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          hasSpread = true;
          continue;
        }
        if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
          continue;
        }
        try {
          const name = resolvePropertyName(
            property.name,
            analysis,
            'computed type-bearing transition property',
          );
          if (properties.has(name)) {
            throw new Error(`duplicate ${name} property in type-bearing transition object`);
          }
          properties.set(name, property);
        } catch {
          unresolvedPropertyName = true;
        }
      }
      const typeProperty = properties.get('type');
      const transitionShaped =
        properties.has('stiffness') || properties.has('damping') || properties.has('mass');
      if (transitionShaped && unresolvedPropertyName) {
        throw new Error('unresolved property name in type-bearing transition object');
      }
      if (transitionShaped && hasSpread) {
        throw new Error('unresolved spread in type-bearing transition object');
      }
      if (typeProperty) {
        let type;
        try {
          type = resolvePropertyValue(typeProperty, analysis, 'type-bearing transition object');
        } catch (error) {
          if (transitionShaped) {
            const position = sourceFile.getLineAndCharacterOfPosition(typeProperty.name.getStart());
            throw new Error(`${path}:${position.line + 1}: ${error.message}`, { cause: error });
          }
        }
        if (type !== 'spring') {
          ts.forEachChild(node, visit);
          return;
        }
        const declaration = findVariableDeclaration(node);
        if (declaration && !isConstVariable(declaration)) {
          throw new Error('mutable type-bearing transition object');
        }
        const stiffness = resolvePropertyValue(
          properties.get('stiffness'),
          analysis,
          'spring stiffness',
        );
        const damping = resolvePropertyValue(properties.get('damping'), analysis, 'spring damping');
        if (typeof stiffness !== 'number' || typeof damping !== 'number') {
          throw new Error('unresolved numeric spring authority');
        }
        const position = sourceFile.getLineAndCharacterOfPosition(typeProperty.name.getStart());
        const legacy = {
          type: 'spring',
          stiffness,
          damping,
        };
        if (properties.has('mass')) {
          const mass = resolvePropertyValue(properties.get('mass'), analysis, 'spring mass');
          if (typeof mass !== 'number') throw new Error('unresolved numeric spring mass');
          legacy.mass = mass;
        }
        discovered.push({
          path,
          line: position.line + 1,
          occurrence: 0,
          locator: declaration?.name.text ?? null,
          legacy,
          authoritySymbol: declaration
            ? analysis.checker.getSymbolAtLocation(declaration.name)
            : undefined,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  function targetsAuthority(expression, authoritySymbol) {
    const current = unwrapExpression(expression);
    if (ts.isIdentifier(current)) {
      return symbolResolvesTo(
        analysis.checker.getSymbolAtLocation(current),
        new Set([authoritySymbol]),
        analysis,
      );
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      return targetsAuthority(current.expression, authoritySymbol);
    }
    return false;
  }

  for (const { authoritySymbol } of discovered) {
    if (!authoritySymbol) continue;
    let mutated = false;
    function findMutation(node) {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        targetsAuthority(node.left, authoritySymbol)
      ) {
        mutated = true;
      } else if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        targetsAuthority(node.operand, authoritySymbol)
      ) {
        mutated = true;
      } else if (
        ts.isDeleteExpression(node) &&
        targetsAuthority(node.expression, authoritySymbol)
      ) {
        mutated = true;
      }
      if (!mutated) ts.forEachChild(node, findMutation);
    }
    findMutation(sourceFile);
    if (mutated) throw new Error('mutable type-bearing transition object');

    function isAllowedReference(identifier) {
      if (
        ts.isVariableDeclaration(identifier.parent) &&
        identifier.parent.name === identifier &&
        isConstVariable(identifier.parent)
      ) {
        return true;
      }

      let current = identifier;
      while (
        current.parent &&
        (ts.isAsExpression(current.parent) ||
          ts.isSatisfiesExpression(current.parent) ||
          ts.isParenthesizedExpression(current.parent))
      ) {
        current = current.parent;
      }
      if (
        ts.isVariableDeclaration(current.parent) &&
        current.parent.initializer === current &&
        isConstVariable(current.parent)
      ) {
        return true;
      }
      if (
        ts.isCallExpression(current.parent) &&
        current.parent.arguments.includes(current) &&
        ts.isIdentifier(current.parent.expression) &&
        ['useThemeMotionTransition', 'useThemeLayoutTransition'].includes(
          current.parent.expression.text,
        ) &&
        namedImportIdentity(
          current.parent.expression,
          current.parent.expression.text,
          THEME_MOTION_MODULE,
          analysis,
        )
      ) {
        return true;
      }
      if (
        ts.isPropertyAccessExpression(current.parent) &&
        current.parent.expression === current &&
        !(
          ts.isCallExpression(current.parent.parent) &&
          current.parent.parent.expression === current.parent
        )
      ) {
        return true;
      }
      return false;
    }

    let escaped = false;
    function findEscape(node) {
      if (
        ts.isIdentifier(node) &&
        symbolResolvesTo(
          analysis.checker.getSymbolAtLocation(node),
          new Set([authoritySymbol]),
          analysis,
        ) &&
        !isAllowedReference(node)
      ) {
        escaped = true;
      }
      if (!escaped) ts.forEachChild(node, findEscape);
    }
    findEscape(sourceFile);
    if (escaped) throw new Error('escaped type-bearing transition authority');
  }

  const occurrencesByLine = new Map();
  return discovered.map((entry) => {
    const occurrence = (occurrencesByLine.get(entry.line) ?? 0) + 1;
    occurrencesByLine.set(entry.line, occurrence);
    const { authoritySymbol: _authoritySymbol, ...publicEntry } = entry;
    return { ...publicEntry, occurrence };
  });
}

function discoverSpringsInSource(absolutePath) {
  return discoverSprings(
    readFileSync(absolutePath, 'utf8'),
    slash(relative(repositoryRoot, absolutePath)),
  );
}

function discoverRawSprings() {
  return productionSources().flatMap(discoverSpringsInSource);
}

function entryKey({ path, line, occurrence }) {
  return `${path}:${line}:${occurrence}`;
}

function symbolResolvesTo(symbol, targets, analysis, seen = new Set()) {
  if (!symbol || seen.has(symbol)) return false;
  if (targets.has(symbol)) return true;
  seen.add(symbol);
  const declaration = variableDeclarationForSymbol(symbol);
  if (!declaration?.initializer || !isConstVariable(declaration)) return false;
  const initializer = unwrapExpression(declaration.initializer);
  if (!ts.isIdentifier(initializer)) return false;
  return symbolResolvesTo(
    analysis.checker.getSymbolAtLocation(initializer),
    targets,
    analysis,
    seen,
  );
}

function expressionUsesSymbols(expression, targets, analysis) {
  let matched = false;
  function visit(node) {
    if (
      ts.isIdentifier(node) &&
      symbolResolvesTo(analysis.checker.getSymbolAtLocation(node), targets, analysis)
    ) {
      matched = true;
    }
    if (!matched) ts.forEachChild(node, visit);
  }
  if (expression) visit(expression);
  return matched;
}

function namedImportIdentity(identifier, importedName, moduleSpecifier, analysis) {
  if (!ts.isIdentifier(identifier)) return false;
  const symbol = analysis.checker.getSymbolAtLocation(identifier);
  if (symbol?.declarations?.length !== 1 || !ts.isImportSpecifier(symbol.declarations[0])) {
    return false;
  }
  const declaration = symbol.declarations[0];
  if ((declaration.propertyName?.text ?? declaration.name.text) !== importedName) return false;
  let current = declaration.parent;
  while (current && !ts.isImportDeclaration(current)) current = current.parent;
  return (
    current &&
    ts.isImportDeclaration(current) &&
    ts.isStringLiteral(current.moduleSpecifier) &&
    current.moduleSpecifier.text === moduleSpecifier
  );
}

function approvedAdapterPreservesTransition(call, sourceFile, targets, analysis, override = {}) {
  if (!ts.isIdentifier(call.expression)) return false;
  const authority = APPROVED_TRANSITION_ADAPTERS[call.expression.text];
  if (!authority) return false;
  if (!expressionUsesSymbols(call.arguments[authority.transitionParameter], targets, analysis)) {
    return false;
  }
  const imported = namedImportIdentity(
    call.expression,
    call.expression.text,
    authority.moduleSpecifier,
    analysis,
  );
  if (!imported) return false;

  const adapterPath = override.path ?? authority.path;
  const adapterSource =
    override.source ?? readFileSync(resolve(repositoryRoot, ...authority.path.split('/')), 'utf8');
  const adapterAnalysis = createSourceAnalysis(adapterSource, adapterPath);
  const declaration = adapterAnalysis.sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === call.expression.text,
  );
  const parameter = declaration?.parameters[authority.transitionParameter];
  if (!declaration?.body || !parameter || !ts.isIdentifier(parameter.name)) return false;
  const parameterSymbol = adapterAnalysis.checker.getSymbolAtLocation(parameter.name);
  if (!parameterSymbol) return false;
  const parameterAuthority = new Set([parameterSymbol]);
  function isExactTransitionReturn(identifier) {
    let current = identifier;
    while (
      current.parent &&
      (ts.isAsExpression(current.parent) ||
        ts.isSatisfiesExpression(current.parent) ||
        ts.isParenthesizedExpression(current.parent))
    ) {
      current = current.parent;
    }
    if (
      !ts.isPropertyAssignment(current.parent) ||
      current.parent.initializer !== current ||
      resolvePropertyName(
        current.parent.name,
        adapterAnalysis,
        'approved transition adapter return',
      ) !== 'transition'
    ) {
      return false;
    }
    let object = current.parent.parent;
    while (
      object.parent &&
      (ts.isAsExpression(object.parent) ||
        ts.isSatisfiesExpression(object.parent) ||
        ts.isParenthesizedExpression(object.parent))
    ) {
      object = object.parent;
    }
    return ts.isObjectLiteralExpression(current.parent.parent) &&
      ts.isReturnStatement(object.parent)
      ? object.parent.expression === object
      : false;
  }

  function isImmutableDirectAlias(identifier) {
    if (
      ts.isVariableDeclaration(identifier.parent) &&
      identifier.parent.name === identifier &&
      isConstVariable(identifier.parent)
    ) {
      const initializer = unwrapExpression(identifier.parent.initializer);
      return (
        ts.isIdentifier(initializer) &&
        symbolResolvesTo(
          adapterAnalysis.checker.getSymbolAtLocation(initializer),
          parameterAuthority,
          adapterAnalysis,
        )
      );
    }
    let current = identifier;
    while (
      current.parent &&
      (ts.isAsExpression(current.parent) ||
        ts.isSatisfiesExpression(current.parent) ||
        ts.isParenthesizedExpression(current.parent))
    ) {
      current = current.parent;
    }
    return (
      ts.isVariableDeclaration(current.parent) &&
      current.parent.initializer === current &&
      isConstVariable(current.parent) &&
      ts.isIdentifier(unwrapExpression(current.parent.initializer))
    );
  }

  let parameterEscaped = false;
  function findParameterEscape(node) {
    if (
      ts.isIdentifier(node) &&
      symbolResolvesTo(
        adapterAnalysis.checker.getSymbolAtLocation(node),
        parameterAuthority,
        adapterAnalysis,
      )
    ) {
      const parameterDeclaration = ts.isParameter(node.parent) && node.parent.name === node;
      if (
        !parameterDeclaration &&
        !isImmutableDirectAlias(node) &&
        !isExactTransitionReturn(node)
      ) {
        parameterEscaped = true;
      }
    }
    if (!parameterEscaped) ts.forEachChild(node, findParameterEscape);
  }
  findParameterEscape(declaration);
  if (parameterEscaped) return false;

  const returns = [];
  function collectReturns(node) {
    if (node !== declaration && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) returns.push(node);
    ts.forEachChild(node, collectReturns);
  }
  function spreadMayDefineTransition(expression, seen = new Set()) {
    const current = unwrapExpression(expression);
    if (ts.isIdentifier(current)) {
      const symbol = adapterAnalysis.checker.getSymbolAtLocation(current);
      if (!symbol || seen.has(symbol)) return true;
      const alias = variableDeclarationForSymbol(symbol);
      if (!alias?.initializer || !isConstVariable(alias)) return true;
      seen.add(symbol);
      const result = spreadMayDefineTransition(alias.initializer, seen);
      seen.delete(symbol);
      return result;
    }
    if (ts.isConditionalExpression(current)) {
      return (
        spreadMayDefineTransition(current.whenTrue, new Set(seen)) ||
        spreadMayDefineTransition(current.whenFalse, new Set(seen))
      );
    }
    if (!ts.isObjectLiteralExpression(current)) return true;
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) {
        if (spreadMayDefineTransition(property.expression, new Set(seen))) return true;
        continue;
      }
      if (
        !ts.isPropertyAssignment(property) &&
        !ts.isShorthandPropertyAssignment(property) &&
        !ts.isMethodDeclaration(property) &&
        !ts.isGetAccessorDeclaration(property) &&
        !ts.isSetAccessorDeclaration(property)
      ) {
        return true;
      }
      try {
        if (
          resolvePropertyName(
            property.name,
            adapterAnalysis,
            'approved transition adapter spread',
          ) === 'transition'
        ) {
          return true;
        }
      } catch {
        return true;
      }
    }
    return false;
  }
  collectReturns(declaration.body);
  return (
    returns.length > 0 &&
    returns.every((statement) => {
      const expression = unwrapExpression(statement.expression);
      if (!ts.isObjectLiteralExpression(expression)) return false;
      let transition;
      for (const property of expression.properties) {
        if (ts.isSpreadAssignment(property)) {
          if (spreadMayDefineTransition(property.expression)) return false;
          continue;
        }
        let name;
        try {
          name = resolvePropertyName(property.name, adapterAnalysis, 'approved transition adapter');
        } catch {
          return false;
        }
        if (name !== 'transition') continue;
        if (transition || !ts.isPropertyAssignment(property)) return false;
        transition = property;
      }
      const transitionValue = unwrapExpression(transition?.initializer);
      return (
        ts.isIdentifier(transitionValue) &&
        symbolResolvesTo(
          adapterAnalysis.checker.getSymbolAtLocation(transitionValue),
          new Set([parameterSymbol]),
          adapterAnalysis,
        )
      );
    })
  );
}

function derivedConstSymbols(initialSymbols, sourceFile, analysis) {
  const derived = new Set(initialSymbols);
  const declarations = [];
  function collect(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isConstVariable(node)
    ) {
      declarations.push(node);
    }
    ts.forEachChild(node, collect);
  }
  collect(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      const symbol = analysis.checker.getSymbolAtLocation(declaration.name);
      const initializer = unwrapExpression(declaration.initializer);
      const preservesCallResult =
        !ts.isCallExpression(initializer) ||
        approvedAdapterPreservesTransition(initializer, sourceFile, derived, analysis);
      if (
        symbol &&
        !derived.has(symbol) &&
        preservesCallResult &&
        expressionUsesSymbols(initializer, derived, analysis)
      ) {
        derived.add(symbol);
        changed = true;
      }
    }
  }
  return derived;
}

function variableResultSymbol(call, analysis) {
  let current = call;
  while (
    current.parent &&
    (ts.isAsExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isParenthesizedExpression(current.parent))
  ) {
    current = current.parent;
  }
  if (
    ts.isVariableDeclaration(current.parent) &&
    current.parent.initializer === current &&
    ts.isIdentifier(current.parent.name) &&
    isConstVariable(current.parent)
  ) {
    return analysis.checker.getSymbolAtLocation(current.parent.name);
  }
  return undefined;
}

function jsxAttribute(element, name) {
  return element.attributes.properties.find(
    (property) =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

function jsxAttributeExpression(attribute) {
  if (!attribute?.initializer) return undefined;
  return ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
}

function spreadHasSafeLayout(expression, layoutSymbols, analysis, seen = new Set()) {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) {
    const symbol = analysis.checker.getSymbolAtLocation(current);
    if (!symbol || seen.has(symbol)) return false;
    const declaration = variableDeclarationForSymbol(symbol);
    if (!declaration?.initializer || !isConstVariable(declaration)) return false;
    seen.add(symbol);
    return spreadHasSafeLayout(declaration.initializer, layoutSymbols, analysis, seen);
  }
  if (!ts.isObjectLiteralExpression(current)) return false;

  for (const property of current.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!spreadHasSafeLayout(property.expression, layoutSymbols, analysis, new Set(seen))) {
        return false;
      }
      continue;
    }
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return false;
    }
    let name;
    try {
      name = resolvePropertyName(property.name, analysis, 'layout spread property');
    } catch {
      return false;
    }
    if (name !== 'layout' && name !== 'layoutId') continue;
    if (name === 'layoutId') return false;
    if (ts.isPropertyAssignment(property)) {
      const value = unwrapExpression(property.initializer);
      if (
        value?.kind !== ts.SyntaxKind.FalseKeyword &&
        !expressionUsesSymbols(value, layoutSymbols, analysis)
      ) {
        return false;
      }
    } else {
      const symbol =
        analysis.checker.getShorthandAssignmentValueSymbol(property) ??
        analysis.checker.getSymbolAtLocation(property.name);
      if (!symbolResolvesTo(symbol, layoutSymbols, analysis)) return false;
    }
  }
  return true;
}

function resolveProjectModule(fromPath, specifier, sources) {
  let base;
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  } else if (specifier.startsWith('@/')) {
    base = posix.normalize(posix.join('app/src', specifier.slice(2)));
  } else {
    return undefined;
  }
  if (base !== 'app/src' && !base.startsWith('app/src/')) return null;
  const extension = posix.extname(base);
  let candidates;
  if (!extension) {
    candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  } else {
    const stem = base.slice(0, -extension.length);
    const substitutions = {
      '.js': [`${stem}.ts`, `${stem}.tsx`, `${stem}.d.ts`, base],
      '.jsx': [`${stem}.tsx`, `${stem}.d.ts`, base],
      '.mjs': [`${stem}.mts`, `${stem}.d.mts`, base],
      '.cjs': [`${stem}.cts`, `${stem}.d.cts`, base],
    };
    candidates = substitutions[extension] ?? [base];
  }
  const matches = [...new Set(candidates)].filter((candidate) => sources.has(candidate));
  if (matches.length > 1) return null;
  return matches[0];
}

function authorityExportGraph(sources, authorityPath, authorityName) {
  const graph = new Map();
  const authoritySource = sources.get(authorityPath);
  if (!authoritySource) return graph;
  const authorityAnalysis = createSourceAnalysis(authoritySource, authorityPath);
  const directlyExported = authorityAnalysis.sourceFile.statements.some((statement) => {
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      return statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === authorityName,
      );
    }
    return (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some(
        (element) => (element.propertyName?.text ?? element.name.text) === authorityName,
      )
    );
  });
  if (!directlyExported) return graph;
  graph.set(authorityPath, new Set([authorityName]));

  let changed = true;
  while (changed) {
    changed = false;
    for (const [path, source] of sources) {
      const analysis = createSourceAnalysis(source, path);
      const localAuthorityImports = new Set();
      const localAuthoritySymbols = new Set();
      if (path === authorityPath) {
        for (const statement of analysis.sourceFile.statements) {
          if (!ts.isVariableStatement(statement)) continue;
          for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== authorityName) {
              continue;
            }
            const symbol = analysis.checker.getSymbolAtLocation(declaration.name);
            if (symbol) localAuthoritySymbols.add(symbol);
          }
        }
      }
      for (const statement of analysis.sourceFile.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          !statement.importClause?.namedBindings ||
          !ts.isNamedImports(statement.importClause.namedBindings)
        ) {
          continue;
        }
        const targetPath = resolveProjectModule(path, statement.moduleSpecifier.text, sources);
        if (targetPath === null) return null;
        const targetExports = graph.get(targetPath);
        if (!targetExports) continue;
        for (const element of statement.importClause.namedBindings.elements) {
          if (targetExports.has(element.propertyName?.text ?? element.name.text)) {
            localAuthorityImports.add(element.name.text);
            const symbol = analysis.checker.getSymbolAtLocation(element.name);
            if (symbol) localAuthoritySymbols.add(symbol);
          }
        }
      }

      for (const statement of analysis.sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          const initializer = unwrapExpression(declaration.initializer);
          if (
            !ts.isIdentifier(declaration.name) ||
            !isConstVariable(declaration) ||
            !initializer ||
            !ts.isIdentifier(initializer) ||
            !symbolResolvesTo(
              analysis.checker.getSymbolAtLocation(initializer),
              localAuthoritySymbols,
              analysis,
            )
          ) {
            continue;
          }
          const symbol = analysis.checker.getSymbolAtLocation(declaration.name);
          if (symbol) localAuthoritySymbols.add(symbol);
          localAuthorityImports.add(declaration.name.text);
        }
      }

      for (const statement of analysis.sourceFile.statements) {
        if (
          !ts.isVariableStatement(statement) ||
          !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          continue;
        }
        const additions = statement.declarationList.declarations
          .filter(
            (declaration) =>
              ts.isIdentifier(declaration.name) &&
              localAuthoritySymbols.has(analysis.checker.getSymbolAtLocation(declaration.name)),
          )
          .map((declaration) => declaration.name.text);
        if (additions.length === 0) continue;
        const pathExports = graph.get(path) ?? new Set();
        const previousSize = pathExports.size;
        additions.forEach((name) => pathExports.add(name));
        graph.set(path, pathExports);
        if (pathExports.size !== previousSize) changed = true;
      }

      for (const statement of analysis.sourceFile.statements) {
        if (!ts.isExportDeclaration(statement)) continue;
        const targetPath =
          statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
            ? resolveProjectModule(path, statement.moduleSpecifier.text, sources)
            : undefined;
        if (targetPath === null) return null;
        const targetExports = graph.get(targetPath);
        if (statement.moduleSpecifier && !targetExports) continue;
        const additions = [];
        if (!statement.exportClause) {
          additions.push(...(targetExports ?? []));
        } else if (ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) {
            const importedName = element.propertyName?.text ?? element.name.text;
            if (
              (targetExports && targetExports.has(importedName)) ||
              (!statement.moduleSpecifier && localAuthorityImports.has(importedName))
            ) {
              additions.push(element.name.text);
            }
          }
        }
        if (additions.length === 0) continue;
        const exports = graph.get(path) ?? new Set();
        const previousSize = exports.size;
        additions.forEach((name) => exports.add(name));
        graph.set(path, exports);
        if (exports.size !== previousSize) changed = true;
      }
    }
  }
  return graph;
}

function validateCrossFileConsumerClosure({
  authorityName,
  authorityPath,
  binding,
  manifestConsumers,
  sources,
}) {
  const exports = authorityExportGraph(sources, authorityPath, authorityName);
  if (exports === null) return false;
  if (exports.size === 0) return true;
  const expectedHook =
    binding === 'useThemeLayoutTransition'
      ? 'useThemeLayoutTransition'
      : 'useThemeMotionTransition';
  const actualConsumers = new Set();
  let invalidReference = false;

  for (const [path, source] of sources) {
    const analysis = createSourceAnalysis(source, path);
    const importedTargets = [];
    if (path === authorityPath) {
      for (const statement of analysis.sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.name.text !== authorityName) {
            continue;
          }
          const symbol = analysis.checker.getSymbolAtLocation(declaration.name);
          if (symbol) importedTargets.push(symbol);
        }
      }
    }
    for (const statement of analysis.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const targetPath = resolveProjectModule(path, statement.moduleSpecifier.text, sources);
      if (targetPath === null) return false;
      const targetExports = exports.get(targetPath);
      if (!targetExports) continue;
      if (
        statement.importClause?.name ||
        !statement.importClause?.namedBindings ||
        !ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        return false;
      }
      for (const element of statement.importClause.namedBindings.elements) {
        if (!targetExports.has(element.propertyName?.text ?? element.name.text)) continue;
        const symbol = analysis.checker.getSymbolAtLocation(element.name);
        if (symbol) importedTargets.push(symbol);
      }
    }

    let unsupportedAuthorityReference = false;
    function inspectUnsupportedModuleReference(node) {
      if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamespaceExport(node.exportClause) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const targetPath = resolveProjectModule(path, node.moduleSpecifier.text, sources);
        if (targetPath === null || exports.has(targetPath)) {
          unsupportedAuthorityReference = true;
          return;
        }
      }
      if (ts.isCallExpression(node)) {
        const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
        if (isDynamicImport || isRequire) {
          if (node.arguments.length !== 1) {
            unsupportedAuthorityReference = true;
            return;
          }
          let moduleSpecifier;
          try {
            moduleSpecifier = resolvePrimitive(
              node.arguments[0],
              analysis,
              new Set(),
              'dynamic module target',
            );
          } catch {
            unsupportedAuthorityReference = true;
            return;
          }
          if (typeof moduleSpecifier !== 'string') {
            unsupportedAuthorityReference = true;
            return;
          }
          const targetPath = resolveProjectModule(path, moduleSpecifier, sources);
          if (targetPath === null || exports.has(targetPath)) {
            unsupportedAuthorityReference = true;
            return;
          }
        }
      }
      ts.forEachChild(node, inspectUnsupportedModuleReference);
    }
    inspectUnsupportedModuleReference(analysis.sourceFile);
    if (unsupportedAuthorityReference) return false;
    if (importedTargets.length === 0) continue;
    const targets = new Set(importedTargets);
    const hookArguments = new Set();

    function isAliasDeclarationReference(identifier) {
      if (
        ts.isVariableDeclaration(identifier.parent) &&
        identifier.parent.name === identifier &&
        isConstVariable(identifier.parent)
      ) {
        return true;
      }
      let current = identifier;
      while (
        current.parent &&
        (ts.isAsExpression(current.parent) ||
          ts.isSatisfiesExpression(current.parent) ||
          ts.isParenthesizedExpression(current.parent))
      ) {
        current = current.parent;
      }
      return (
        ts.isVariableDeclaration(current.parent) &&
        current.parent.initializer === current &&
        isConstVariable(current.parent)
      );
    }

    function inspect(node) {
      if (
        ts.isIdentifier(node) &&
        symbolResolvesTo(analysis.checker.getSymbolAtLocation(node), targets, analysis)
      ) {
        if (
          ts.isImportSpecifier(node.parent) ||
          ts.isExportSpecifier(node.parent) ||
          isAliasDeclarationReference(node)
        ) {
          ts.forEachChild(node, inspect);
          return;
        }
        let current = node;
        while (
          current.parent &&
          (ts.isAsExpression(current.parent) ||
            ts.isSatisfiesExpression(current.parent) ||
            ts.isParenthesizedExpression(current.parent))
        ) {
          current = current.parent;
        }
        if (
          ts.isCallExpression(current.parent) &&
          current.parent.arguments.includes(current) &&
          ts.isIdentifier(current.parent.expression) &&
          current.parent.expression.text === expectedHook &&
          namedImportIdentity(
            current.parent.expression,
            expectedHook,
            THEME_MOTION_MODULE,
            analysis,
          )
        ) {
          hookArguments.add(node.text);
        } else {
          invalidReference = true;
        }
      }
      if (!invalidReference) ts.forEachChild(node, inspect);
    }
    inspect(analysis.sourceFile);
    if (invalidReference) return false;

    for (const argument of hookArguments) {
      const consumer = `${path}#${expectedHook}(${argument})`;
      actualConsumers.add(consumer);
      if (!sourceHasBindingCall(source, path, expectedHook, argument)) return false;
    }
  }

  return (
    JSON.stringify([...actualConsumers].sort()) === JSON.stringify([...manifestConsumers].sort())
  );
}

function sourceHasBindingCall(source, path, binding, locator, options = {}) {
  const analysis = createSourceAnalysis(source, path);
  const { sourceFile } = analysis;
  const fail = () => false;
  const calls = [];
  const jsxElements = [];
  const layoutCalls = [];

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const argument = unwrapExpression(node.arguments[0]);
      if (
        node.expression.text === binding &&
        namedImportIdentity(node.expression, binding, THEME_MOTION_MODULE, analysis) &&
        ts.isIdentifier(argument) &&
        argument.text === locator
      ) {
        calls.push({ call: node, rawSymbol: analysis.checker.getSymbolAtLocation(argument) });
      }
      if (
        node.expression.text === 'useThemeMotionLayout' &&
        namedImportIdentity(node.expression, 'useThemeMotionLayout', THEME_MOTION_MODULE, analysis)
      ) {
        layoutCalls.push(node);
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      jsxElements.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (calls.length === 0 || calls.some(({ rawSymbol }) => !rawSymbol)) {
    return fail('missing exact hook call or raw symbol');
  }

  const rawSymbols = new Set(calls.map(({ rawSymbol }) => rawSymbol));
  const resultSymbols = new Set();
  for (const { call } of calls) {
    const resultSymbol = variableResultSymbol(call, analysis);
    if (!resultSymbol) return fail('hook result is not assigned to an immutable symbol');
    resultSymbols.add(resultSymbol);
  }

  const derivedResultSymbols = derivedConstSymbols(resultSymbols, sourceFile, analysis);
  const elementUses = (element, symbols) => {
    const transition = jsxAttribute(element, 'transition');
    if (
      transition &&
      expressionUsesSymbols(jsxAttributeExpression(transition), symbols, analysis)
    ) {
      return true;
    }
    return element.attributes.properties.some(
      (property) =>
        ts.isJsxSpreadAttribute(property) &&
        expressionUsesSymbols(property.expression, symbols, analysis),
    );
  };
  const consumedElements = jsxElements.filter((element) =>
    elementUses(element, derivedResultSymbols),
  );
  if (consumedElements.length === 0) return fail('hook result does not reach a JSX consumer');
  const derivedRawSymbols = derivedConstSymbols(rawSymbols, sourceFile, analysis);
  if (jsxElements.some((element) => elementUses(element, derivedRawSymbols))) {
    return fail('raw legacy transition reaches a JSX consumer directly');
  }
  for (const resultSymbol of resultSymbols) {
    const derivedFromResult = derivedConstSymbols(new Set([resultSymbol]), sourceFile, analysis);
    if (!consumedElements.some((element) => elementUses(element, derivedFromResult))) {
      return fail('one exact hook result is ignored');
    }
  }

  if (options.layoutPolicy === 'disabled') {
    const layoutResultSymbols = new Set(
      layoutCalls.map((call) => variableResultSymbol(call, analysis)).filter(Boolean),
    );
    const guardedLayoutAttributes = [];
    function collectGuardedLayout(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const layout = jsxAttribute(node, 'layout');
        if (
          layout &&
          expressionUsesSymbols(jsxAttributeExpression(layout), layoutResultSymbols, analysis)
        ) {
          guardedLayoutAttributes.push(layout);
        }
      }
      ts.forEachChild(node, collectGuardedLayout);
    }
    collectGuardedLayout(sourceFile);
    if (guardedLayoutAttributes.length === 0) return fail('no consumed layout guard');

    for (const element of consumedElements) {
      if (jsxAttribute(element, 'layoutId')) {
        return fail('transition consumer has shared layout identity');
      }
      for (const property of element.attributes.properties) {
        if (
          ts.isJsxSpreadAttribute(property) &&
          !spreadHasSafeLayout(property.expression, layoutResultSymbols, analysis)
        ) {
          return fail('transition consumer spread can enable layout');
        }
      }
      const layout = jsxAttribute(element, 'layout');
      if (!layout) continue;
      const expression = jsxAttributeExpression(layout);
      const explicitlyFalse = expression?.kind === ts.SyntaxKind.FalseKeyword;
      if (!explicitlyFalse && !expressionUsesSymbols(expression, layoutResultSymbols, analysis)) {
        return fail('transition consumer has unguarded layout');
      }
    }
  }
  if (
    options.consumerClosure &&
    !validateCrossFileConsumerClosure({
      authorityName: options.consumerClosure.authorityName ?? locator,
      binding,
      ...options.consumerClosure,
    })
  ) {
    return fail('cross-file consumer authority is incomplete');
  }
  return true;
}

function schemaTypeMatches(value, expected) {
  if (expected === 'null') return value === null;
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object')
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'integer') return Number.isInteger(value);
  return typeof value === expected;
}

function validateAgainstSchema(value, schema, location = '$') {
  const failures = [];
  const expectedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (expectedTypes.length > 0 && !expectedTypes.some((type) => schemaTypeMatches(value, type))) {
    return [`${location}: expected ${expectedTypes.join('|')}`];
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    failures.push(`${location}: value does not match const`);
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))
  ) {
    failures.push(`${location}: value is not in enum`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      failures.push(`${location}: string is shorter than minLength`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
      failures.push(`${location}: string does not match pattern`);
    }
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    failures.push(`${location}: number is below minimum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      failures.push(`${location}: array is shorter than minItems`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        failures.push(`${location}: array items are not unique`);
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        failures.push(...validateAgainstSchema(item, schema.items, `${location}[${index}]`));
      });
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!(required in value)) failures.push(`${location}: missing required property ${required}`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties ?? {}))) {
          failures.push(`${location}: unexpected property ${key}`);
        }
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) {
        failures.push(...validateAgainstSchema(value[key], childSchema, `${location}.${key}`));
      }
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const matchingBranches = schema.oneOf.filter(
      (branch) => validateAgainstSchema(value, branch, location).length === 0,
    ).length;
    if (matchingBranches !== 1) failures.push(`${location}: expected exactly one oneOf match`);
  }
  return failures;
}

function validateManifestShape(manifest, schema) {
  const failures = validateAgainstSchema(manifest, schema);
  const requiredRoot = ['schemaVersion', 'authority', 'sourceRoot', 'policies', 'entries'];
  const requiredEntry = [
    'id',
    'path',
    'line',
    'occurrence',
    'locator',
    'role',
    'legacy',
    'consumers',
    'sakuraReachable',
    'ownerLane',
    'sakuraPolicy',
    'reducedMotionPolicy',
    'binding',
    'layoutAffecting',
    'layoutPolicy',
    'semanticException',
  ];

  if (schema?.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    failures.push('schema must use JSON Schema draft 2020-12');
  }
  if (schema?.properties?.schemaVersion?.const !== 1) {
    failures.push('schemaVersion must be frozen to 1 in the schema');
  }
  if (JSON.stringify(schema?.required) !== JSON.stringify(requiredRoot)) {
    failures.push('schema root required fields drifted');
  }
  if (
    JSON.stringify(schema?.properties?.entries?.items?.required) !== JSON.stringify(requiredEntry)
  ) {
    failures.push('schema entry required fields drifted');
  }
  if (manifest?.schemaVersion !== 1) failures.push('manifest schemaVersion must be 1');
  if (manifest?.authority !== 'vibespace.sakura.motion.v1') {
    failures.push('manifest authority must be vibespace.sakura.motion.v1');
  }
  if (manifest?.sourceRoot !== 'app/src') failures.push('manifest sourceRoot must be app/src');
  if (!Array.isArray(manifest?.entries) || manifest.entries.length === 0) {
    failures.push('manifest entries must be a non-empty array');
  }

  const ids = new Set();
  const locations = new Set();
  for (const entry of manifest?.entries ?? []) {
    for (const field of requiredEntry) {
      if (!(field in entry)) failures.push(`${entry.id ?? '<unknown>'}: missing ${field}`);
    }
    if (typeof entry.id !== 'string' || !/^[a-z0-9.-]+$/u.test(entry.id)) {
      failures.push(`${entry.id ?? '<unknown>'}: invalid id`);
    } else if (ids.has(entry.id)) {
      failures.push(`${entry.id}: duplicate id`);
    }
    ids.add(entry.id);

    if (
      typeof entry.path !== 'string' ||
      !entry.path.startsWith('app/src/') ||
      entry.path.includes('\\')
    ) {
      failures.push(`${entry.id}: invalid source path`);
    }
    if (!Number.isInteger(entry.line) || entry.line < 1) {
      failures.push(`${entry.id}: invalid line`);
    }
    if (!Number.isInteger(entry.occurrence) || entry.occurrence < 1) {
      failures.push(`${entry.id}: invalid occurrence`);
    }
    if (typeof entry.locator !== 'string' || entry.locator.length < 3) {
      failures.push(`${entry.id}: missing stable locator`);
    }
    if (typeof entry.role !== 'string' || entry.role.length < 8) {
      failures.push(`${entry.id}: missing semantic role`);
    }
    if (
      entry.legacy?.type !== 'spring' ||
      typeof entry.legacy?.stiffness !== 'number' ||
      typeof entry.legacy?.damping !== 'number'
    ) {
      failures.push(`${entry.id}: incomplete exact legacy spring`);
    }
    if (
      !Array.isArray(entry.consumers) ||
      entry.consumers.length === 0 ||
      entry.consumers.some((consumer) => typeof consumer !== 'string' || !consumer.includes('#'))
    ) {
      failures.push(`${entry.id}: consumers must be non-empty path#locator strings`);
    }
    if (entry.sakuraReachable !== true) {
      failures.push(`${entry.id}: every manifested transition must be Sakura-reachable`);
    }
    const location = entryKey(entry);
    if (locations.has(location)) failures.push(`${entry.id}: duplicate location ${location}`);
    locations.add(location);

    if (typeof entry.ownerLane !== 'string' || entry.ownerLane.length < 3) {
      failures.push(`${entry.id}: missing owner lane`);
    }
    if (!['shared-theme-policy', 'semantic-exception'].includes(entry.sakuraPolicy)) {
      failures.push(`${entry.id}: invalid Sakura policy`);
    }
    if (entry.reducedMotionPolicy !== 'zero-duration') {
      failures.push(`${entry.id}: reduced motion must be zero-duration`);
    }
    if (entry.sakuraPolicy === 'shared-theme-policy') {
      if (
        ![
          'useThemeMotionTransition',
          'useThemeLayoutTransition',
          'consumer-useThemeMotionTransition',
        ].includes(entry.binding)
      ) {
        failures.push(`${entry.id}: shared-policy row has an invalid binding`);
      }
      if (entry.semanticException !== null) {
        failures.push(`${entry.id}: shared-policy row cannot carry an exception`);
      }
    } else {
      if (entry.binding !== null) failures.push(`${entry.id}: exception binding must be null`);
      const approved = APPROVED_SEMANTIC_EXCEPTIONS.find(
        (exception) =>
          exception.id === entry.id &&
          exception.path === entry.path &&
          exception.locator === entry.locator &&
          exception.reviewId === entry.semanticException?.reviewId &&
          exception.rationale === entry.semanticException?.rationale,
      );
      if (!approved) failures.push(`${entry.id}: semantic exception is not independently approved`);
    }
    if (typeof entry.layoutAffecting !== 'boolean') {
      failures.push(`${entry.id}: layoutAffecting must be boolean`);
    }
    if (
      !['disabled', 'instant', 'not-applicable'].includes(entry.layoutPolicy) ||
      (entry.layoutAffecting && entry.layoutPolicy === 'not-applicable') ||
      (!entry.layoutAffecting && entry.layoutPolicy !== 'not-applicable')
    ) {
      failures.push(`${entry.id}: layout policy does not match layout authority`);
    }
  }
  return failures;
}

test('motion authority is schema-bound and closes every production raw spring location', () => {
  const manifest = readJson(manifestPath);
  const schema = readJson(schemaPath);
  assert.deepEqual(validateManifestShape(manifest, schema), []);

  const discovered = discoverRawSprings();
  const recorded = manifest.entries.map(({ path, line, occurrence }) => ({
    path,
    line,
    occurrence,
  }));
  assert.deepEqual(
    recorded.map(entryKey).sort(),
    discovered.map(entryKey).sort(),
    'motion manifest must contain every discovered raw spring exactly once with no stale rows',
  );
});

test('AST discovery and exact binding reject regex and unrelated-hook bypasses', () => {
  const source = [
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    "const TYPE_KEY = 'type';",
    "const SPRING_TRANSITION_TYPE = 'spring';",
    'const ALIASED_SPRING = SPRING_TRANSITION_TYPE;',
    "const quoted = { 'type': ALIASED_SPRING, stiffness: 111, damping: 22 };",
    "const computed = { [TYPE_KEY]: 'spring', stiffness: 333, damping: 44, mass: 0.5 };",
    'const unrelated = useThemeMotionTransition(computed);',
    'const view = <motion.div transition={unrelated} />;',
  ].join('\n');
  const discovered = discoverSprings(source, 'app/src/__contract-fixture__.tsx');

  assert.deepEqual(
    discovered.map(({ locator, legacy }) => ({ locator, legacy })),
    [
      {
        locator: 'quoted',
        legacy: { type: 'spring', stiffness: 111, damping: 22 },
      },
      {
        locator: 'computed',
        legacy: { type: 'spring', stiffness: 333, damping: 44, mass: 0.5 },
      },
    ],
  );
  assert.equal(
    sourceHasBindingCall(
      source,
      'app/src/__contract-fixture__.tsx',
      'useThemeMotionTransition',
      'computed',
    ),
    true,
  );
  assert.equal(
    sourceHasBindingCall(
      source,
      'app/src/__contract-fixture__.tsx',
      'useThemeMotionTransition',
      'quoted',
    ),
    false,
    'an unrelated hook must not authorize another raw spring',
  );
});

test('AST discovery finds shorthand spring properties with lexical constants', () => {
  const source = [
    "const type = 'spring';",
    'const stiffness = 410;',
    'const damping = 31;',
    'const RAW = { type, stiffness, damping };',
  ].join('\n');

  assert.deepEqual(
    discoverSprings(source, 'app/src/__shorthand-fixture__.ts').map(({ locator, legacy }) => ({
      locator,
      legacy,
    })),
    [{ locator: 'RAW', legacy: { type: 'spring', stiffness: 410, damping: 31 } }],
  );
});

test('AST discovery resolves shadowed constants lexically and rejects mutable or unresolved shapes', () => {
  const shadowed = [
    "const type = 'tween';",
    'function fixture() {',
    "  const type = 'spring';",
    '  const RAW = { type, stiffness: 400, damping: 30 };',
    '}',
  ].join('\n');
  assert.deepEqual(
    discoverSprings(shadowed, 'app/src/__shadow-fixture__.ts').map(({ locator, legacy }) => ({
      locator,
      legacy,
    })),
    [{ locator: 'RAW', legacy: { type: 'spring', stiffness: 400, damping: 30 } }],
  );

  const mutable = [
    "let type = 'spring';",
    "type = 'tween';",
    'const RAW = { type, stiffness: 400, damping: 30 };',
  ].join('\n');
  assert.throws(
    () => discoverSprings(mutable, 'app/src/__mutable-fixture__.ts'),
    /mutable.*type-bearing transition/iu,
  );

  const mutatedObject = [
    "const RAW = { type: 'spring', stiffness: 400, damping: 30 };",
    'const alias = RAW;',
    'alias.stiffness = 100;',
  ].join('\n');
  assert.throws(
    () => discoverSprings(mutatedObject, 'app/src/__object-mutation-fixture__.ts'),
    /mutable.*type-bearing transition/iu,
  );

  const unresolved = 'const RAW = { type: getTransitionType(), stiffness: 400, damping: 30 };';
  assert.throws(
    () => discoverSprings(unresolved, 'app/src/__unresolved-fixture__.ts'),
    /unresolved.*type-bearing transition/iu,
  );
});

test('binding analysis rejects an ignored policy result followed by direct legacy use', () => {
  const source = [
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    "const RAW = { type: 'spring', stiffness: 400, damping: 30 };",
    'function Fixture() {',
    '  useThemeMotionTransition(RAW);',
    '  return <motion.div transition={RAW} />;',
    '}',
  ].join('\n');

  assert.equal(
    sourceHasBindingCall(
      source,
      'app/src/__ignored-result-fixture__.tsx',
      'useThemeMotionTransition',
      'RAW',
    ),
    false,
    'calling the hook without consuming its exact result must fail closed',
  );

  const discardedByHelper = [
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    "const RAW = { type: 'spring', stiffness: 400, damping: 30 };",
    'const discard = (_transition) => ({});',
    'function Fixture() {',
    '  const policy = useThemeMotionTransition(RAW);',
    '  const props = discard(policy);',
    '  return <motion.div {...props} />;',
    '}',
  ].join('\n');
  assert.equal(
    sourceHasBindingCall(
      discardedByHelper,
      'app/src/__discarded-helper-fixture__.tsx',
      'useThemeMotionTransition',
      'RAW',
    ),
    false,
    'passing the result through an unproved helper must fail closed',
  );
});

test('layout analysis rejects an unrelated guard beside an unguarded transition consumer', () => {
  const source = [
    "import { useThemeMotionLayout, useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    "const RAW = { type: 'spring', stiffness: 400, damping: 30 };",
    'function Fixture() {',
    '  const transition = useThemeMotionTransition(RAW);',
    '  const unrelatedLayout = useThemeMotionLayout(true);',
    '  return <>',
    '    <motion.div layout={unrelatedLayout} />',
    '    <motion.div layout transition={transition} />',
    '  </>;',
    '}',
  ].join('\n');

  assert.equal(
    sourceHasBindingCall(
      source,
      'app/src/__layout-fixture__.tsx',
      'useThemeMotionTransition',
      'RAW',
      { layoutPolicy: 'disabled' },
    ),
    false,
    'a guard on another JSX element must not authorize raw layout animation',
  );
});

test('binding analysis rejects local and wrong-module hook impostors', () => {
  const localImpostor = [
    "const RAW = { type: 'spring', stiffness: 400, damping: 30 };",
    'const useThemeMotionTransition = (transition) => transition;',
    'function Fixture() {',
    '  const policy = useThemeMotionTransition(RAW);',
    '  return <motion.div transition={policy} />;',
    '}',
  ].join('\n');
  assert.equal(
    sourceHasBindingCall(
      localImpostor,
      'app/src/__local-hook-impostor__.tsx',
      'useThemeMotionTransition',
      'RAW',
    ),
    false,
  );

  const importedImpostor = [
    "import { useThemeMotionTransition } from './fakeThemeMotion';",
    "const RAW = { type: 'spring', stiffness: 400, damping: 30 };",
    'const policy = useThemeMotionTransition(RAW);',
    'const view = <motion.div transition={policy} />;',
  ].join('\n');
  assert.equal(
    sourceHasBindingCall(
      importedImpostor,
      'app/src/__imported-hook-impostor__.tsx',
      'useThemeMotionTransition',
      'RAW',
    ),
    false,
  );

  const shadowedImport = [
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    "const RAW = { type: 'spring', stiffness: 400, damping: 30 };",
    'function Fixture() {',
    '  const useThemeMotionTransition = (transition) => transition;',
    '  const policy = useThemeMotionTransition(RAW);',
    '  return <motion.div transition={policy} />;',
    '}',
  ].join('\n');
  assert.equal(
    sourceHasBindingCall(
      shadowedImport,
      'app/src/__shadowed-hook-import__.tsx',
      'useThemeMotionTransition',
      'RAW',
    ),
    false,
  );
});

test('spring discovery rejects overriding spreads and every unapproved authority escape', () => {
  const overridingSpread = [
    'declare const unknownSpring: object;',
    "const RAW = { type: 'tween', stiffness: 400, damping: 30, ...unknownSpring };",
  ].join('\n');
  assert.throws(
    () => discoverSprings(overridingSpread, 'app/src/__spread-override-fixture__.ts'),
    /unresolved spread.*type-bearing transition/iu,
  );

  for (const [name, escape] of [
    ['reflect-set', "Reflect.set(RAW, 'stiffness', 100);"],
    ['define-property', "Object.defineProperty(RAW, 'damping', { value: 10 });"],
    ['mutating-helper', 'mutateTransition(RAW);'],
  ]) {
    const source = ["const RAW = { type: 'spring', stiffness: 400, damping: 30 };", escape].join(
      '\n',
    );
    assert.throws(
      () => discoverSprings(source, `app/src/__${name}-fixture__.ts`),
      /escaped.*type-bearing transition authority/iu,
      name,
    );
  }
});

test('layout analysis rejects layout hidden inside policy-derived spread props', () => {
  const source = [
    "import { useThemeMotionLayout, useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    "const RAW = { type: 'spring', stiffness: 400, damping: 30 };",
    'function Fixture() {',
    '  const policy = useThemeMotionTransition(RAW);',
    '  const guardedLayout = useThemeMotionLayout(true);',
    '  const unsafeProps = { transition: policy, layout: true };',
    '  return <>',
    '    <motion.div layout={guardedLayout} />',
    '    <motion.div {...unsafeProps} />',
    '  </>;',
    '}',
  ].join('\n');
  assert.equal(
    sourceHasBindingCall(
      source,
      'app/src/__spread-layout-fixture__.tsx',
      'useThemeMotionTransition',
      'RAW',
      { layoutPolicy: 'disabled' },
    ),
    false,
  );
});

test('approved adapter returns must preserve the exact policy parameter without fallback', () => {
  const consumer = [
    "import { resolveDropdownMotion } from './dropdownMotion';",
    'const policy = {};',
    'const props = resolveDropdownMotion(false, policy);',
  ].join('\n');
  const analysis = createSourceAnalysis(consumer, 'app/src/features/chat/__adapter-fixture__.tsx');
  let call;
  function findCall(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'resolveDropdownMotion'
    ) {
      call = node;
    }
    ts.forEachChild(node, findCall);
  }
  findCall(analysis.sourceFile);
  const policyDeclaration = analysis.sourceFile.statements.find(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'policy',
      ),
  ).declarationList.declarations[0];
  const policySymbol = analysis.checker.getSymbolAtLocation(policyDeclaration.name);
  const unsafeAdapter = [
    'const LEGACY = {};',
    'export function resolveDropdownMotion(reduced, themeTransition) {',
    '  return { transition: reduced ? themeTransition : LEGACY };',
    '}',
  ].join('\n');

  assert.equal(
    approvedAdapterPreservesTransition(
      call,
      analysis.sourceFile,
      new Set([policySymbol]),
      analysis,
      {
        source: unsafeAdapter,
        path: 'app/src/features/chat/__unsafe-adapter-fixture__.ts',
      },
    ),
    false,
  );

  const reassignedAdapter = [
    'const LEGACY = {};',
    'export function resolveDropdownMotion(_reduced, themeTransition) {',
    '  themeTransition = LEGACY;',
    '  return { transition: themeTransition };',
    '}',
  ].join('\n');
  assert.equal(
    approvedAdapterPreservesTransition(
      call,
      analysis.sourceFile,
      new Set([policySymbol]),
      analysis,
      {
        source: reassignedAdapter,
        path: 'app/src/features/chat/__reassigned-adapter-fixture__.ts',
      },
    ),
    false,
  );

  const outwardLeakAdapter = [
    'let leakedTransition;',
    'export function resolveDropdownMotion(_reduced, themeTransition) {',
    '  leakedTransition = themeTransition;',
    '  return { transition: themeTransition };',
    '}',
  ].join('\n');
  assert.equal(
    approvedAdapterPreservesTransition(
      call,
      analysis.sourceFile,
      new Set([policySymbol]),
      analysis,
      {
        source: outwardLeakAdapter,
        path: 'app/src/features/chat/__leaking-adapter-fixture__.ts',
      },
    ),
    false,
  );

  const laterOverrideAdapter = [
    'const LEGACY = {};',
    'export function resolveDropdownMotion(reduced, themeTransition) {',
    '  const overrides = reduced ? { transition: LEGACY } : {};',
    '  return { transition: themeTransition, ...overrides };',
    '}',
  ].join('\n');
  assert.equal(
    approvedAdapterPreservesTransition(
      call,
      analysis.sourceFile,
      new Set([policySymbol]),
      analysis,
      {
        source: laterOverrideAdapter,
        path: 'app/src/features/chat/__later-override-adapter-fixture__.ts',
      },
    ),
    false,
  );
});

test('cross-file closure rejects unlisted direct consumers and accepts the complete safe set', () => {
  const authorityPath = 'app/src/features/chat/dropdownMotion.ts';
  const barrelPath = 'app/src/features/chat/motionExports.ts';
  const constAliasPath = 'app/src/features/chat/dropdownMotionAlias.ts';
  const constAliasBarrelPath = 'app/src/features/chat/dropdownMotionAliasBarrel.ts';
  const safePath = 'app/src/features/chat/SafeDropdown.tsx';
  const unsafePath = 'app/src/features/chat/UnsafeDropdown.tsx';
  const unsafeAliasPath = 'app/src/features/chat/UnsafeAliasDropdown.tsx';
  const authority = [
    "export const LEGACY_DROPDOWN_TRANSITION = Object.freeze({ type: 'spring', stiffness: 500, damping: 30 });",
  ].join('\n');
  const barrel = [
    "export { LEGACY_DROPDOWN_TRANSITION as DROPDOWN_SPRING } from './dropdownMotion';",
  ].join('\n');
  const constAlias = [
    "import { LEGACY_DROPDOWN_TRANSITION as RAW } from './dropdownMotion';",
    'const LOCAL_ALIAS = RAW;',
    'export const EXPORTED_ALIAS = LOCAL_ALIAS;',
  ].join('\n');
  const constAliasBarrel = [
    "export { EXPORTED_ALIAS as BARREL_ALIAS } from './dropdownMotionAlias';",
  ].join('\n');
  const safe = [
    "import { DROPDOWN_SPRING as safeSpring } from './motionExports';",
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    'const listedSpring = safeSpring;',
    'export function SafeDropdown() {',
    '  const transition = useThemeMotionTransition(listedSpring);',
    '  return <motion.div transition={transition} />;',
    '}',
  ].join('\n');
  const unsafe = [
    "import { LEGACY_DROPDOWN_TRANSITION } from './dropdownMotion';",
    'export const UnsafeDropdown = () => (',
    '  <motion.div transition={LEGACY_DROPDOWN_TRANSITION} />',
    ');',
  ].join('\n');
  const unsafeAlias = [
    "import { BARREL_ALIAS as escapedAlias } from './dropdownMotionAliasBarrel';",
    'export const UnsafeAliasDropdown = () => (',
    '  <motion.div transition={escapedAlias} />',
    ');',
  ].join('\n');
  const dynamicTemplate = [
    'export async function loadDropdownMotion() {',
    '  return import(`./dropdownMotion`);',
    '}',
  ].join('\n');
  const dynamicAlias = [
    "const modulePath = './dropdownMotion';",
    'export async function loadDropdownMotion() {',
    '  return import(modulePath);',
    '}',
  ].join('\n');
  const manifestConsumers = [`${safePath}#useThemeMotionTransition(listedSpring)`];
  const safeSources = new Map([
    [authorityPath, authority],
    [barrelPath, barrel],
    [safePath, safe],
  ]);
  assert.equal(
    sourceHasBindingCall(safe, safePath, 'useThemeMotionTransition', 'listedSpring', {
      consumerClosure: {
        authorityName: 'LEGACY_DROPDOWN_TRANSITION',
        authorityPath,
        manifestConsumers,
        sources: safeSources,
      },
    }),
    true,
  );

  const unsafeSources = new Map(safeSources);
  unsafeSources.set(unsafePath, unsafe);
  assert.equal(
    sourceHasBindingCall(safe, safePath, 'useThemeMotionTransition', 'listedSpring', {
      consumerClosure: {
        authorityName: 'LEGACY_DROPDOWN_TRANSITION',
        authorityPath,
        manifestConsumers,
        sources: unsafeSources,
      },
    }),
    false,
  );

  const unsafeAliasSources = new Map(safeSources);
  unsafeAliasSources.set(constAliasPath, constAlias);
  unsafeAliasSources.set(constAliasBarrelPath, constAliasBarrel);
  unsafeAliasSources.set(unsafeAliasPath, unsafeAlias);
  assert.equal(
    sourceHasBindingCall(safe, safePath, 'useThemeMotionTransition', 'listedSpring', {
      consumerClosure: {
        authorityName: 'LEGACY_DROPDOWN_TRANSITION',
        authorityPath,
        manifestConsumers,
        sources: unsafeAliasSources,
      },
    }),
    false,
  );

  for (const [dynamicPath, dynamicSource] of [
    ['app/src/features/chat/DynamicTemplate.ts', dynamicTemplate],
    ['app/src/features/chat/DynamicAlias.ts', dynamicAlias],
  ]) {
    const dynamicSources = new Map(safeSources);
    dynamicSources.set(dynamicPath, dynamicSource);
    assert.equal(
      sourceHasBindingCall(safe, safePath, 'useThemeMotionTransition', 'listedSpring', {
        consumerClosure: {
          authorityName: 'LEGACY_DROPDOWN_TRANSITION',
          authorityPath,
          manifestConsumers,
          sources: dynamicSources,
        },
      }),
      false,
    );
  }
});

test('cross-file closure accepts an exact manifested consumer through exported const aliases', () => {
  const authorityPath = 'app/src/features/chat/dropdownMotion.ts';
  const constAliasPath = 'app/src/features/chat/dropdownMotionAlias.ts';
  const barrelPath = 'app/src/features/chat/dropdownMotionAliasBarrel.ts';
  const safePath = 'app/src/features/chat/SafeAliasDropdown.tsx';
  const authority =
    "export const LEGACY_DROPDOWN_TRANSITION = Object.freeze({ type: 'spring', stiffness: 500, damping: 30 });";
  const constAlias = [
    "import { LEGACY_DROPDOWN_TRANSITION as RAW } from './dropdownMotion';",
    'const LOCAL_ALIAS = RAW;',
    'export const EXPORTED_ALIAS = LOCAL_ALIAS;',
  ].join('\n');
  const barrel = "export { EXPORTED_ALIAS as BARREL_ALIAS } from './dropdownMotionAlias';";
  const safe = [
    "import { BARREL_ALIAS as listedAlias } from './dropdownMotionAliasBarrel';",
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    'export function SafeAliasDropdown() {',
    '  const transition = useThemeMotionTransition(listedAlias);',
    '  return <motion.div transition={transition} />;',
    '}',
  ].join('\n');
  const manifestConsumers = [`${safePath}#useThemeMotionTransition(listedAlias)`];
  const sources = new Map([
    [authorityPath, authority],
    [constAliasPath, constAlias],
    [barrelPath, barrel],
    [safePath, safe],
  ]);

  assert.equal(
    sourceHasBindingCall(safe, safePath, 'useThemeMotionTransition', 'listedAlias', {
      consumerClosure: {
        authorityName: 'LEGACY_DROPDOWN_TRANSITION',
        authorityPath,
        manifestConsumers,
        sources,
      },
    }),
    true,
  );
});

test('cross-file closure rejects an unlisted direct consumer using a TypeScript-resolved .js specifier', () => {
  const authorityPath = 'app/src/features/chat/dropdownMotion.ts';
  const safePath = 'app/src/features/chat/SafeDropdown.tsx';
  const unsafePath = 'app/src/features/chat/UnsafeJsSpecifierDropdown.tsx';
  const authority =
    "export const LEGACY_DROPDOWN_TRANSITION = Object.freeze({ type: 'spring', stiffness: 500, damping: 30 });";
  const safe = [
    "import { LEGACY_DROPDOWN_TRANSITION } from './dropdownMotion';",
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    'export const SafeDropdown = () => {',
    '  const transition = useThemeMotionTransition(LEGACY_DROPDOWN_TRANSITION);',
    '  return <motion.div transition={transition} />;',
    '};',
  ].join('\n');
  const unsafe = [
    "import { LEGACY_DROPDOWN_TRANSITION as escapedSpring } from './dropdownMotion.js';",
    'export const UnsafeDropdown = () => (',
    '  <motion.div transition={escapedSpring} />',
    ');',
  ].join('\n');
  const manifestConsumers = [`${safePath}#useThemeMotionTransition(LEGACY_DROPDOWN_TRANSITION)`];
  const sources = new Map([
    [authorityPath, authority],
    [safePath, safe],
    [unsafePath, unsafe],
  ]);

  assert.equal(
    sourceHasBindingCall(safe, safePath, 'useThemeMotionTransition', 'LEGACY_DROPDOWN_TRANSITION', {
      consumerClosure: {
        authorityName: 'LEGACY_DROPDOWN_TRANSITION',
        authorityPath,
        manifestConsumers,
        sources,
      },
    }),
    false,
  );
});

test('cross-file closure accepts an exact manifested hook consumer using a .js specifier', () => {
  const authorityPath = 'app/src/features/chat/dropdownMotion.ts';
  const safePath = 'app/src/features/chat/SafeJsSpecifierDropdown.tsx';
  const authority =
    "export const LEGACY_DROPDOWN_TRANSITION = Object.freeze({ type: 'spring', stiffness: 500, damping: 30 });";
  const safe = [
    "import { LEGACY_DROPDOWN_TRANSITION as listedSpring } from './dropdownMotion.js';",
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    'export const SafeDropdown = () => {',
    '  const transition = useThemeMotionTransition(listedSpring);',
    '  return <motion.div transition={transition} />;',
    '};',
  ].join('\n');
  const manifestConsumers = [`${safePath}#useThemeMotionTransition(listedSpring)`];
  const sources = new Map([
    [authorityPath, authority],
    [safePath, safe],
  ]);

  assert.equal(
    sourceHasBindingCall(safe, safePath, 'useThemeMotionTransition', 'listedSpring', {
      consumerClosure: {
        authorityName: 'LEGACY_DROPDOWN_TRANSITION',
        authorityPath,
        manifestConsumers,
        sources,
      },
    }),
    true,
  );
});

test('bounded module resolution substitutes JS-family extensions and rejects ambiguity', () => {
  assert.equal(
    resolveProjectModule(
      'app/src/features/chat/consumer.ts',
      './authority.mjs',
      new Map([['app/src/features/chat/authority.mts', 'export {};']]),
    ),
    'app/src/features/chat/authority.mts',
  );
  assert.equal(
    resolveProjectModule(
      'app/src/features/chat/consumer.ts',
      './authority.cjs',
      new Map([['app/src/features/chat/authority.cts', 'export {};']]),
    ),
    'app/src/features/chat/authority.cts',
  );
  assert.equal(
    resolveProjectModule(
      'app/src/features/chat/consumer.ts',
      './authority.js',
      new Map([
        ['app/src/features/chat/authority.ts', 'export {};'],
        ['app/src/features/chat/authority.tsx', 'export {};'],
      ]),
    ),
    null,
  );
});

test('cross-file closure rejects normalized @ alias traversal direct consumers', () => {
  const authorityPath = 'app/src/features/chat/dropdownMotion.ts';
  const safePath = 'app/src/features/chat/SafeDropdown.tsx';
  const authority =
    "export const LEGACY_DROPDOWN_TRANSITION = Object.freeze({ type: 'spring', stiffness: 500, damping: 30 });";
  const safe = [
    "import { LEGACY_DROPDOWN_TRANSITION } from './dropdownMotion';",
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    'export const SafeDropdown = () => {',
    '  const transition = useThemeMotionTransition(LEGACY_DROPDOWN_TRANSITION);',
    '  return <motion.div transition={transition} />;',
    '};',
  ].join('\n');
  const manifestConsumers = [`${safePath}#useThemeMotionTransition(LEGACY_DROPDOWN_TRANSITION)`];

  for (const [unsafePath, specifier] of [
    [
      'app/src/features/chat/UnsafeAliasTraversalDropdown.tsx',
      '@/features/chat/../chat/dropdownMotion',
    ],
    [
      'app/src/features/chat/UnsafeAliasTraversalJsDropdown.tsx',
      '@/features/chat/../chat/dropdownMotion.js',
    ],
  ]) {
    const unsafe = [
      `import { LEGACY_DROPDOWN_TRANSITION as escapedSpring } from '${specifier}';`,
      'export const UnsafeDropdown = () => (',
      '  <motion.div transition={escapedSpring} />',
      ');',
    ].join('\n');
    const sources = new Map([
      [authorityPath, authority],
      [safePath, safe],
      [unsafePath, unsafe],
    ]);
    assert.equal(
      sourceHasBindingCall(
        safe,
        safePath,
        'useThemeMotionTransition',
        'LEGACY_DROPDOWN_TRANSITION',
        {
          consumerClosure: {
            authorityName: 'LEGACY_DROPDOWN_TRANSITION',
            authorityPath,
            manifestConsumers,
            sources,
          },
        },
      ),
      false,
      specifier,
    );
  }
});

test('cross-file closure accepts an exact manifested normalized @ alias consumer', () => {
  const authorityPath = 'app/src/features/chat/dropdownMotion.ts';
  const safePath = 'app/src/features/chat/SafeAliasTraversalDropdown.tsx';
  const authority =
    "export const LEGACY_DROPDOWN_TRANSITION = Object.freeze({ type: 'spring', stiffness: 500, damping: 30 });";
  const safe = [
    "import { LEGACY_DROPDOWN_TRANSITION as listedSpring } from '@/features/chat/../chat/dropdownMotion.js';",
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    'export const SafeDropdown = () => {',
    '  const transition = useThemeMotionTransition(listedSpring);',
    '  return <motion.div transition={transition} />;',
    '};',
  ].join('\n');
  const manifestConsumers = [`${safePath}#useThemeMotionTransition(listedSpring)`];
  const sources = new Map([
    [authorityPath, authority],
    [safePath, safe],
  ]);

  assert.equal(
    sourceHasBindingCall(safe, safePath, 'useThemeMotionTransition', 'listedSpring', {
      consumerClosure: {
        authorityName: 'LEGACY_DROPDOWN_TRANSITION',
        authorityPath,
        manifestConsumers,
        sources,
      },
    }),
    true,
  );
});

test('bounded @ alias resolution rejects escape and normalized ambiguity', () => {
  assert.equal(
    resolveProjectModule(
      'app/src/features/chat/consumer.ts',
      '@/../outside',
      new Map([['app/outside.ts', 'export {};']]),
    ),
    null,
  );
  assert.equal(
    resolveProjectModule(
      'app/src/features/chat/consumer.ts',
      '@/features/chat/../chat/authority.js',
      new Map([
        ['app/src/features/chat/authority.ts', 'export {};'],
        ['app/src/features/chat/authority.tsx', 'export {};'],
      ]),
    ),
    null,
  );
});

test('cross-file closure rejects relative imports that escape the production root', () => {
  const authorityPath = 'app/src/features/chat/dropdownMotion.ts';
  const safePath = 'app/src/features/chat/SafeDropdown.tsx';
  const authority =
    "export const LEGACY_DROPDOWN_TRANSITION = Object.freeze({ type: 'spring', stiffness: 500, damping: 30 });";
  const safe = [
    "import { LEGACY_DROPDOWN_TRANSITION } from './dropdownMotion';",
    "import { useThemeMotionTransition } from '@/features/appearance/themeMotion';",
    'export const SafeDropdown = () => {',
    '  const transition = useThemeMotionTransition(LEGACY_DROPDOWN_TRANSITION);',
    '  return <motion.div transition={transition} />;',
    '};',
  ].join('\n');
  const manifestConsumers = [`${safePath}#useThemeMotionTransition(LEGACY_DROPDOWN_TRANSITION)`];

  for (const [unsafePath, specifier] of [
    ['app/src/features/chat/UnsafeRelativeEscapeDropdown.tsx', '../../../hiddenAuthority'],
    ['app/src/features/chat/UnsafeRelativeEscapeJsDropdown.tsx', '../../../hiddenAuthority.js'],
  ]) {
    const unsafe = [
      `import { HIDDEN_TRANSITION as escapedSpring } from '${specifier}';`,
      'export const UnsafeDropdown = () => (',
      '  <motion.div transition={escapedSpring} />',
      ');',
    ].join('\n');
    const sources = new Map([
      [authorityPath, authority],
      [safePath, safe],
      [unsafePath, unsafe],
    ]);
    assert.equal(
      sourceHasBindingCall(
        safe,
        safePath,
        'useThemeMotionTransition',
        'LEGACY_DROPDOWN_TRANSITION',
        {
          consumerClosure: {
            authorityName: 'LEGACY_DROPDOWN_TRANSITION',
            authorityPath,
            manifestConsumers,
            sources,
          },
        },
      ),
      false,
      specifier,
    );
  }
});

test('bounded relative resolution rejects root escape and preserves in-root normalization', () => {
  const sources = new Map([
    ['app/src/features/chat/dropdownMotion.ts', 'export {};'],
    ['app/hiddenAuthority.ts', 'export {};'],
  ]);
  assert.equal(
    resolveProjectModule('app/src/features/chat/consumer.ts', '../../../hiddenAuthority', sources),
    null,
  );
  assert.equal(
    resolveProjectModule(
      'app/src/features/chat/consumer.ts',
      '../../../hiddenAuthority.js',
      sources,
    ),
    null,
  );
  assert.equal(
    resolveProjectModule(
      'app/src/features/chat/nested/consumer.ts',
      '.././dropdownMotion.js',
      sources,
    ),
    'app/src/features/chat/dropdownMotion.ts',
  );
});

test('production source collection includes and parses real .mts and .cts modules', () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'vibespace-motion-collector-'));
  try {
    writeFileSync(
      resolve(fixtureRoot, 'hiddenAuthority.mts'),
      "export const HIDDEN_MTS = { type: 'spring', stiffness: 301, damping: 31 };",
    );
    writeFileSync(
      resolve(fixtureRoot, 'hiddenAuthority.cts'),
      "export const HIDDEN_CTS = { type: 'spring', stiffness: 302, damping: 32 };",
    );
    writeFileSync(
      resolve(fixtureRoot, 'ignored.test.mts'),
      "export const IGNORED = { type: 'spring', stiffness: 999, damping: 99 };",
    );

    const collected = productionSources(fixtureRoot);
    assert.deepEqual(
      collected.map((path) => slash(relative(fixtureRoot, path))),
      ['hiddenAuthority.cts', 'hiddenAuthority.mts'],
    );
    const discovered = collected.flatMap(discoverSpringsInSource);
    assert.deepEqual(discovered.map((entry) => entry.locator).sort(), ['HIDDEN_CTS', 'HIDDEN_MTS']);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('schema application and independent exception authority fail closed', () => {
  const manifest = readJson(manifestPath);
  const schema = readJson(schemaPath);
  const missingPolicies = structuredClone(manifest);
  delete missingPolicies.policies;
  assert.ok(
    validateManifestShape(missingPolicies, schema).some((failure) => failure.includes('policies')),
  );

  const extraProperty = structuredClone(manifest);
  extraProperty.entries[0].unreviewed = true;
  assert.ok(
    validateManifestShape(extraProperty, schema).some((failure) =>
      failure.includes('unexpected property unreviewed'),
    ),
  );

  const duplicateConsumer = structuredClone(manifest);
  duplicateConsumer.entries[0].consumers.push(duplicateConsumer.entries[0].consumers[0]);
  assert.ok(
    validateManifestShape(duplicateConsumer, schema).some((failure) =>
      failure.includes('not unique'),
    ),
  );

  const inventedException = structuredClone(manifest);
  inventedException.entries[0].sakuraPolicy = 'semantic-exception';
  inventedException.entries[0].binding = null;
  inventedException.entries[0].semanticException = {
    reviewId: 'SAK-MOTION-EXCEPTION-999',
    rationale: 'A self-asserted rationale must never authorize itself.',
  };
  assert.ok(
    validateManifestShape(inventedException, schema).some((failure) =>
      failure.includes('not independently approved'),
    ),
  );
});

test('shared-policy rows are source-reachable and exceptions fail closed', () => {
  const manifest = readJson(manifestPath);
  const sourceByPath = new Map();
  const projectSources = new Map(
    productionSources().map((absolutePath) => [
      slash(relative(repositoryRoot, absolutePath)),
      readFileSync(absolutePath, 'utf8'),
    ]),
  );
  const discoveredByLocation = new Map(
    discoverRawSprings().map((entry) => [entryKey(entry), entry]),
  );

  for (const entry of manifest.entries) {
    const source =
      sourceByPath.get(entry.path) ??
      readFileSync(resolve(repositoryRoot, ...entry.path.split('/')), 'utf8');
    sourceByPath.set(entry.path, source);

    const discovered = discoveredByLocation.get(entryKey(entry));
    assert.ok(discovered, `${entry.id}: raw spring location is stale`);
    assert.equal(discovered.locator, entry.locator, `${entry.id}: stable locator is stale`);
    assert.deepEqual(discovered.legacy, entry.legacy, `${entry.id}: exact legacy spring drifted`);

    const consumers = entry.consumers.map((consumer) => {
      const separator = consumer.indexOf('#');
      const consumerPath = consumer.slice(0, separator);
      const locator = consumer.slice(separator + 1);
      const consumerSource = readFileSync(
        resolve(repositoryRoot, ...consumerPath.split('/')),
        'utf8',
      );
      assert.ok(consumerSource.includes(locator), `${entry.id}: consumer locator is stale`);
      return { path: consumerPath, source: consumerSource };
    });
    if (entry.sakuraPolicy === 'shared-theme-policy') {
      const binding =
        entry.binding === 'useThemeLayoutTransition'
          ? 'useThemeLayoutTransition'
          : 'useThemeMotionTransition';
      const bindingSources =
        entry.binding === 'consumer-useThemeMotionTransition'
          ? consumers
          : [{ path: entry.path, source }];
      assert.ok(
        bindingSources.every((candidate) =>
          sourceHasBindingCall(candidate.source, candidate.path, binding, entry.locator, {
            layoutPolicy: entry.layoutPolicy,
          }),
        ),
        `${entry.id}: source/consumer does not bind this exact spring to the shared policy`,
      );
      assert.ok(
        validateCrossFileConsumerClosure({
          authorityName: entry.locator,
          authorityPath: entry.path,
          binding: entry.binding,
          manifestConsumers: entry.consumers,
          sources: projectSources,
        }),
        `${entry.id}: exported spring consumers do not exactly match the manifest`,
      );
    } else {
      assert.ok(
        APPROVED_SEMANTIC_EXCEPTIONS.some(
          (exception) =>
            exception.id === entry.id &&
            exception.path === entry.path &&
            exception.locator === entry.locator &&
            exception.reviewId === entry.semanticException.reviewId &&
            exception.rationale === entry.semanticException.rationale,
        ),
        `${entry.id}: exception is not present in independent approval authority`,
      );
    }
    if (entry.layoutPolicy === 'disabled') {
      assert.ok(
        [source, ...consumers.map((consumer) => consumer.source)].some((candidate) =>
          /\buseThemeMotionLayout\s*\(/u.test(candidate),
        ),
        `${entry.id}: layout animation is not disabled for Sakura`,
      );
    }
    if (entry.layoutPolicy === 'instant') {
      assert.ok(
        [source, ...consumers.map((consumer) => consumer.source)].some((candidate) =>
          /\buseThemeLayoutTransition\s*\(/u.test(candidate),
        ),
        `${entry.id}: layout transition is not immediate for Sakura`,
      );
    }
  }
});

test('the root MotionConfig consumes the same policy and freezes exact bounded timings', () => {
  const shell = readFileSync(resolve(sourceRoot, 'components/layout/AppShell.tsx'), 'utf8');
  const policy = readFileSync(resolve(sourceRoot, 'features/appearance/themeMotion.ts'), 'utf8');

  assert.equal(
    shell.match(/<MotionConfig\b[^>]*transition=\{themeMotionTransition\}/gu)?.length,
    2,
    'both AppShell branches must consume the shared transition',
  );
  assert.doesNotMatch(shell, /<MotionConfig\b[^>]*transition=\{\{/u);
  assert.match(policy, /type:\s*'tween'[\s\S]*?duration:\s*0\.22/u);
  assert.match(policy, /SAKURA_THEME_MOTION_EASE\s*=\s*Object\.freeze\(\[0\.2,\s*0,\s*0,\s*1\]/u);
  assert.match(policy, /REDUCED_THEME_MOTION_TRANSITION[\s\S]*?duration:\s*0/u);
  assert.match(policy, /resolveThemeMotionLayout[\s\S]*?theme === 'sakura'[\s\S]*?return false/u);
  assert.match(
    policy,
    /resolveThemeLayoutTransition[\s\S]*?theme === 'sakura'[\s\S]*?REDUCED_THEME_MOTION_TRANSITION/u,
  );
});
