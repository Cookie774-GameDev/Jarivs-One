import type { GitHubRepositoryIdentity } from './githubRepositoryRetrieval';

export const GITHUB_METADATA_NODE_KINDS = Object.freeze([
  'issue',
  'pull_request',
  'review',
  'commit',
  'release',
  'workflow',
  'workflow_run',
  'check_result',
  'branch',
] as const);

export const GITHUB_METADATA_EDGE_KINDS = Object.freeze([
  'issue_references_file',
  'pr_changes_file',
  'commit_changes_symbol',
  'test_failure_affects_module',
  'release_contains_commit',
  'note_documents_pr',
] as const);

export const GITHUB_PR_CONTEXT_SECTIONS = Object.freeze([
  'changed_files',
  'changed_symbols',
  'tests',
  'review_comments',
  'linked_issues',
  'workflows',
  'risk_areas',
] as const);

export type GitHubMetadataNodeKind = (typeof GITHUB_METADATA_NODE_KINDS)[number];
export type GitHubMetadataEdgeKind = (typeof GITHUB_METADATA_EDGE_KINDS)[number];
export type GitHubPrContextSection = (typeof GITHUB_PR_CONTEXT_SECTIONS)[number];

export interface GitHubMetadataNode {
  id: string;
  kind: GitHubMetadataNodeKind;
  githubId: string | number;
  title: string;
  updatedAt: string;
}

export interface GitHubMetadataEndpoint {
  kind: 'node' | 'note' | 'file' | 'symbol' | 'module';
  id: string;
}

export interface GitHubMetadataEdge {
  id: string;
  kind: GitHubMetadataEdgeKind;
  source: GitHubMetadataEndpoint;
  target: GitHubMetadataEndpoint;
}

export interface GitHubMetadataGraphInput {
  identity: GitHubRepositoryIdentity;
  enabledNodeKinds: readonly GitHubMetadataNodeKind[];
  nodes: readonly GitHubMetadataNode[];
  edges: readonly GitHubMetadataEdge[];
}

export interface GitHubMetadataGraph extends GitHubMetadataGraphInput {
  readOnly: true;
  executable: false;
}

export interface GitHubPullRequestContextInput {
  graph: GitHubMetadataGraph;
  pullRequestNodeId: string;
  changedFiles: readonly string[];
  changedSymbols: readonly string[];
  tests: readonly string[];
  reviewComments: readonly string[];
  linkedIssueNodeIds: readonly string[];
  workflowNodeIds: readonly string[];
  riskAreas: readonly string[];
}

export interface GitHubPullRequestContext {
  identity: GitHubRepositoryIdentity;
  pullRequestNodeId: string;
  sections: Readonly<Record<GitHubPrContextSection, readonly string[]>>;
  readOnly: true;
  executable: false;
}

export interface GitHubPullRequestActionApproval {
  approvalId: string;
  actor: 'direct_user';
  identity: GitHubRepositoryIdentity;
  pullRequestNodeId: string;
  action: 'apply_pr_changes';
  approvedAt: string;
}

export interface GitHubPullRequestActionAuthority {
  isApproved(approval: Readonly<GitHubPullRequestActionApproval>): boolean;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/u;
const SAFE_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/u;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]{1,100}$/u;
const SHA = /^[a-fA-F0-9]{40}$/u;
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
const MAX_ITEMS = 50_000;
const MAX_NODES = 250_000;
const MAX_CHARS = 10_000_000;

function fail(reason: string): never {
  throw new Error(`Invalid GitHub metadata ${reason}.`);
}

function text(value: unknown, reason: string, maximum = 500): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    FORBIDDEN.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function stableId(value: unknown, reason: string): string {
  const id = text(value, reason);
  if (!SAFE_ID.test(id)) fail(reason);
  return id;
}

function isoTimestamp(value: unknown, reason: string): string {
  const result = text(value, reason, 40);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
    fail(reason);
  }
  return result;
}

function filePath(value: unknown): string {
  const result = text(value, 'file path', 1_024).replaceAll('\\', '/');
  if (
    result.startsWith('/') ||
    result.endsWith('/') ||
    result.includes('//') ||
    result.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail('file path');
  }
  return result;
}

function assertClosed(
  value: unknown,
  reason: string,
  depth = 0,
  budget = { nodes: 0, chars: 0 },
): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > 8) fail(reason);
  if (typeof value === 'string') {
    if (value.length > 10_000) fail(reason);
    budget.chars += value.length;
    if (budget.chars > MAX_CHARS) fail(reason);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  let prototype: object | null;
  let keys: PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(reason);
  }
  if (keys.some((key) => typeof key !== 'string')) fail(reason);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || value.length > MAX_ITEMS) fail(reason);
    if (keys.length !== value.length + 1 || !keys.includes('length')) fail(reason);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
      assertClosed(descriptor.value, reason, depth + 1, budget);
    }
    return;
  }
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > 10) fail(reason);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail(reason);
    assertClosed(descriptor.value, reason, depth + 1, budget);
  }
}

function clone<T>(value: T, reason: string): T {
  try {
    assertClosed(value, reason);
    return structuredClone(value);
  } catch {
    return fail(reason);
  }
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(reason);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(reason);
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  reason: string,
): void {
  const keys = new Set(allowed);
  if (Object.keys(value).some((key) => !keys.has(key))) fail(reason);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(reason);
}

function validateIdentity(rawIdentity: GitHubRepositoryIdentity): GitHubRepositoryIdentity {
  const identity = record(rawIdentity, 'identity');
  exact(
    identity,
    ['accountId', 'installationId', 'owner', 'repository', 'resolvedCommitSha'],
    ['accountId', 'installationId', 'owner', 'repository', 'resolvedCommitSha'],
    'identity',
  );
  const owner = text(identity.owner, 'owner', 100);
  const repository = text(identity.repository, 'repository', 100);
  const resolvedCommitSha = text(identity.resolvedCommitSha, 'resolved commit SHA', 40);
  if (
    !SAFE_OWNER.test(owner) ||
    !SAFE_REPOSITORY.test(repository) ||
    repository === '.' ||
    repository === '..' ||
    !SHA.test(resolvedCommitSha)
  ) {
    fail('identity');
  }
  return Object.freeze({
    accountId: stableId(identity.accountId, 'account ID'),
    installationId: stableId(identity.installationId, 'installation ID'),
    owner,
    repository,
    resolvedCommitSha: resolvedCommitSha.toLowerCase(),
  });
}

function sameIdentity(left: GitHubRepositoryIdentity, right: GitHubRepositoryIdentity): boolean {
  return (
    left.accountId === right.accountId &&
    left.installationId === right.installationId &&
    left.owner === right.owner &&
    left.repository === right.repository &&
    left.resolvedCommitSha === right.resolvedCommitSha
  );
}

function validateNode(rawNode: GitHubMetadataNode): Readonly<GitHubMetadataNode> {
  const node = record(rawNode, 'node');
  exact(
    node,
    ['id', 'kind', 'githubId', 'title', 'updatedAt'],
    ['id', 'kind', 'githubId', 'title', 'updatedAt'],
    'node',
  );
  if (!(GITHUB_METADATA_NODE_KINDS as readonly unknown[]).includes(node.kind)) {
    fail('node kind');
  }
  if (
    !(
      (typeof node.githubId === 'number' &&
        Number.isSafeInteger(node.githubId) &&
        node.githubId > 0) ||
      (typeof node.githubId === 'string' && SAFE_ID.test(node.githubId))
    )
  ) {
    fail('GitHub ID');
  }
  return Object.freeze({
    id: stableId(node.id, 'node ID'),
    kind: node.kind as GitHubMetadataNodeKind,
    githubId: node.githubId as string | number,
    title: text(node.title, 'node title', 500),
    updatedAt: isoTimestamp(node.updatedAt, 'node timestamp'),
  });
}

function validateEndpoint(rawEndpoint: GitHubMetadataEndpoint): Readonly<GitHubMetadataEndpoint> {
  const endpoint = record(rawEndpoint, 'endpoint');
  exact(endpoint, ['kind', 'id'], ['kind', 'id'], 'endpoint');
  if (!['node', 'note', 'file', 'symbol', 'module'].includes(endpoint.kind as string)) {
    fail('endpoint kind');
  }
  return Object.freeze({
    kind: endpoint.kind as GitHubMetadataEndpoint['kind'],
    id: endpoint.kind === 'file' ? filePath(endpoint.id) : stableId(endpoint.id, 'endpoint ID'),
  });
}

function endpointNodeKind(
  endpoint: Readonly<GitHubMetadataEndpoint>,
  nodes: ReadonlyMap<string, Readonly<GitHubMetadataNode>>,
): GitHubMetadataNodeKind | undefined {
  return endpoint.kind === 'node' ? nodes.get(endpoint.id)?.kind : undefined;
}

function assertEdgeSemantics(
  edge: Readonly<GitHubMetadataEdge>,
  nodes: ReadonlyMap<string, Readonly<GitHubMetadataNode>>,
): void {
  const sourceKind = endpointNodeKind(edge.source, nodes);
  const targetKind = endpointNodeKind(edge.target, nodes);
  const valid =
    (edge.kind === 'issue_references_file' &&
      sourceKind === 'issue' &&
      edge.target.kind === 'file') ||
    (edge.kind === 'pr_changes_file' &&
      sourceKind === 'pull_request' &&
      edge.target.kind === 'file') ||
    (edge.kind === 'commit_changes_symbol' &&
      sourceKind === 'commit' &&
      edge.target.kind === 'symbol') ||
    (edge.kind === 'test_failure_affects_module' &&
      (sourceKind === 'check_result' || sourceKind === 'workflow_run') &&
      edge.target.kind === 'module') ||
    (edge.kind === 'release_contains_commit' &&
      sourceKind === 'release' &&
      targetKind === 'commit') ||
    (edge.kind === 'note_documents_pr' &&
      edge.source.kind === 'note' &&
      targetKind === 'pull_request');
  if (!valid) fail('edge endpoint');
}

function validateEdge(
  rawEdge: GitHubMetadataEdge,
  nodes: ReadonlyMap<string, Readonly<GitHubMetadataNode>>,
): Readonly<GitHubMetadataEdge> {
  const edge = record(rawEdge, 'edge');
  exact(edge, ['id', 'kind', 'source', 'target'], ['id', 'kind', 'source', 'target'], 'edge');
  if (!(GITHUB_METADATA_EDGE_KINDS as readonly unknown[]).includes(edge.kind)) {
    fail('edge kind');
  }
  const result = Object.freeze({
    id: stableId(edge.id, 'edge ID'),
    kind: edge.kind as GitHubMetadataEdgeKind,
    source: validateEndpoint(edge.source as GitHubMetadataEndpoint),
    target: validateEndpoint(edge.target as GitHubMetadataEndpoint),
  });
  assertEdgeSemantics(result, nodes);
  return result;
}

export function buildGitHubMetadataGraph(
  rawInput: GitHubMetadataGraphInput,
): Readonly<GitHubMetadataGraph> {
  const input = record(clone(rawInput, 'graph'), 'graph');
  exact(
    input,
    ['identity', 'enabledNodeKinds', 'nodes', 'edges'],
    ['identity', 'enabledNodeKinds', 'nodes', 'edges'],
    'graph',
  );
  const identity = validateIdentity(input.identity as GitHubRepositoryIdentity);
  if (
    !Array.isArray(input.enabledNodeKinds) ||
    !Array.isArray(input.nodes) ||
    !Array.isArray(input.edges)
  ) {
    fail('graph collection');
  }
  const enabledNodeKinds = (input.enabledNodeKinds as unknown[]).map((kind) => {
    if (!(GITHUB_METADATA_NODE_KINDS as readonly unknown[]).includes(kind)) {
      fail('enabled node kind');
    }
    return kind as GitHubMetadataNodeKind;
  });
  if (new Set(enabledNodeKinds).size !== enabledNodeKinds.length) {
    fail('duplicate enabled node kind');
  }
  const nodes = (input.nodes as GitHubMetadataNode[]).map(validateNode);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  if (nodeMap.size !== nodes.length) fail('duplicate node');
  if (nodes.some((node) => !enabledNodeKinds.includes(node.kind))) fail('enabled node kind');
  const edges = (input.edges as GitHubMetadataEdge[]).map((edge) => validateEdge(edge, nodeMap));
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length) fail('duplicate edge');
  return Object.freeze({
    identity,
    enabledNodeKinds: Object.freeze(enabledNodeKinds),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    readOnly: true,
    executable: false,
  });
}

function stringList(
  rawItems: unknown,
  reason: string,
  validator: (value: unknown) => string = (value) => text(value, reason, 1_000),
): readonly string[] {
  if (!Array.isArray(rawItems) || rawItems.length > MAX_ITEMS) fail(reason);
  const items = rawItems.map(validator);
  if (new Set(items).size !== items.length) fail(`duplicate ${reason}`);
  return Object.freeze(items);
}

function validateGraph(rawGraph: GitHubMetadataGraph): GitHubMetadataGraph {
  const graph = record(rawGraph, 'graph output');
  exact(
    graph,
    ['identity', 'enabledNodeKinds', 'nodes', 'edges', 'readOnly', 'executable'],
    ['identity', 'enabledNodeKinds', 'nodes', 'edges', 'readOnly', 'executable'],
    'graph output',
  );
  if (graph.readOnly !== true || graph.executable !== false) fail('graph authority');
  return buildGitHubMetadataGraph({
    identity: graph.identity as GitHubRepositoryIdentity,
    enabledNodeKinds: graph.enabledNodeKinds as GitHubMetadataNodeKind[],
    nodes: graph.nodes as GitHubMetadataNode[],
    edges: graph.edges as GitHubMetadataEdge[],
  }) as GitHubMetadataGraph;
}

export function buildGitHubPullRequestContext(
  rawInput: GitHubPullRequestContextInput,
): Readonly<GitHubPullRequestContext> {
  const input = record(clone(rawInput, 'PR context'), 'PR context');
  exact(
    input,
    [
      'graph',
      'pullRequestNodeId',
      'changedFiles',
      'changedSymbols',
      'tests',
      'reviewComments',
      'linkedIssueNodeIds',
      'workflowNodeIds',
      'riskAreas',
    ],
    [
      'graph',
      'pullRequestNodeId',
      'changedFiles',
      'changedSymbols',
      'tests',
      'reviewComments',
      'linkedIssueNodeIds',
      'workflowNodeIds',
      'riskAreas',
    ],
    'PR context',
  );
  const graph = validateGraph(input.graph as GitHubMetadataGraph);
  const pullRequestNodeId = stableId(input.pullRequestNodeId, 'pull request node ID');
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (nodes.get(pullRequestNodeId)?.kind !== 'pull_request') fail('pull request node');
  const linkedIssues = stringList(input.linkedIssueNodeIds, 'linked issue ID', (value) =>
    stableId(value, 'linked issue ID'),
  );
  if (linkedIssues.some((id) => nodes.get(id)?.kind !== 'issue')) fail('linked issue node');
  const workflows = stringList(input.workflowNodeIds, 'workflow ID', (value) =>
    stableId(value, 'workflow ID'),
  );
  if (
    workflows.some(
      (id) => nodes.get(id)?.kind !== 'workflow' && nodes.get(id)?.kind !== 'workflow_run',
    )
  ) {
    fail('workflow node');
  }
  return Object.freeze({
    identity: graph.identity,
    pullRequestNodeId,
    sections: Object.freeze({
      changed_files: stringList(input.changedFiles, 'changed file', filePath),
      changed_symbols: stringList(input.changedSymbols, 'changed symbol'),
      tests: stringList(input.tests, 'test'),
      review_comments: stringList(input.reviewComments, 'review comment'),
      linked_issues: linkedIssues,
      workflows,
      risk_areas: stringList(input.riskAreas, 'risk area'),
    }),
    readOnly: true,
    executable: false,
  });
}

function validatePrContext(rawContext: GitHubPullRequestContext): GitHubPullRequestContext {
  const context = record(clone(rawContext, 'PR context output'), 'PR context output');
  exact(
    context,
    ['identity', 'pullRequestNodeId', 'sections', 'readOnly', 'executable'],
    ['identity', 'pullRequestNodeId', 'sections', 'readOnly', 'executable'],
    'PR context output',
  );
  if (context.readOnly !== true || context.executable !== false) fail('PR context authority');
  const sections = record(context.sections, 'PR sections');
  exact(sections, GITHUB_PR_CONTEXT_SECTIONS, GITHUB_PR_CONTEXT_SECTIONS, 'PR sections');
  return Object.freeze({
    identity: validateIdentity(context.identity as GitHubRepositoryIdentity),
    pullRequestNodeId: stableId(context.pullRequestNodeId, 'pull request node ID'),
    sections: Object.freeze({
      changed_files: stringList(sections.changed_files, 'changed file', filePath),
      changed_symbols: stringList(sections.changed_symbols, 'changed symbol'),
      tests: stringList(sections.tests, 'test'),
      review_comments: stringList(sections.review_comments, 'review comment'),
      linked_issues: stringList(sections.linked_issues, 'linked issue ID', (value) =>
        stableId(value, 'linked issue ID'),
      ),
      workflows: stringList(sections.workflows, 'workflow ID', (value) =>
        stableId(value, 'workflow ID'),
      ),
      risk_areas: stringList(sections.risk_areas, 'risk area'),
    }),
    readOnly: true,
    executable: false,
  });
}

function validateApproval(
  rawApproval: GitHubPullRequestActionApproval,
): GitHubPullRequestActionApproval {
  const approval = record(clone(rawApproval, 'action approval'), 'action approval');
  exact(
    approval,
    ['approvalId', 'actor', 'identity', 'pullRequestNodeId', 'action', 'approvedAt'],
    ['approvalId', 'actor', 'identity', 'pullRequestNodeId', 'action', 'approvedAt'],
    'action approval',
  );
  if (approval.actor !== 'direct_user' || approval.action !== 'apply_pr_changes') {
    fail('action approval');
  }
  return Object.freeze({
    approvalId: stableId(approval.approvalId, 'approval ID'),
    actor: 'direct_user',
    identity: validateIdentity(approval.identity as GitHubRepositoryIdentity),
    pullRequestNodeId: stableId(approval.pullRequestNodeId, 'pull request node ID'),
    action: 'apply_pr_changes',
    approvedAt: isoTimestamp(approval.approvedAt, 'approval timestamp'),
  });
}

export function planGitHubPullRequestAction(
  rawContext: GitHubPullRequestContext,
  rawAction: 'inspect' | 'apply_changes',
  rawApproval: GitHubPullRequestActionApproval | null,
  authority: GitHubPullRequestActionAuthority | null,
) {
  const context = validatePrContext(rawContext);
  if (rawAction !== 'inspect' && rawAction !== 'apply_changes') fail('PR action');
  if (rawAction === 'inspect') {
    if (rawApproval !== null || authority !== null) fail('inspection approval');
    return Object.freeze({
      mode: 'read_only' as const,
      action: 'inspect' as const,
      allowedInsideContextMap: true,
      separateApprovedActionRequired: false,
      handoff: null,
      executable: false as const,
    });
  }
  if (rawApproval === null) {
    if (authority !== null) fail('approval authority');
    return Object.freeze({
      mode: 'read_only' as const,
      action: 'apply_changes' as const,
      allowedInsideContextMap: false,
      separateApprovedActionRequired: true,
      handoff: null,
      executable: false as const,
    });
  }
  const approval = validateApproval(rawApproval);
  if (
    !sameIdentity(approval.identity, context.identity) ||
    approval.pullRequestNodeId !== context.pullRequestNodeId
  ) {
    fail('approval binding');
  }
  if (!authority || typeof authority.isApproved !== 'function') fail('approval authority');
  if (authority.isApproved(approval) !== true) fail('trusted approval');
  return Object.freeze({
    mode: 'read_only' as const,
    action: 'apply_changes' as const,
    allowedInsideContextMap: false,
    separateApprovedActionRequired: true,
    handoff: Object.freeze({
      approvedActionId: approval.approvalId,
      action: approval.action,
      identity: context.identity,
      pullRequestNodeId: context.pullRequestNodeId,
    }),
    executable: false as const,
  });
}
