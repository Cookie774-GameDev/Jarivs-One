import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [
  router,
  persistent,
  legacy,
  composer,
  commands,
  runtime,
  picker,
  rust,
  rlmProduction,
  rlmTool,
  mcpBuiltins,
  auth,
  credentialSnapshot,
  nativeTransport,
  server,
  runtimeManager,
] = await Promise.all([
  read('app/src/lib/ai/router.ts'),
  read('app/src/lib/ai/adapters/opencodePersistent.ts'),
  read('app/src/lib/ai/adapters/opencode.ts'),
  read('app/src/features/chat/Composer.tsx'),
  read('app/src/features/chat/SlashCommandTypeahead.tsx'),
  read('app/src/lib/ai/runtime.ts'),
  read('app/src/lib/ai/useAccessibleChatModels.ts'),
  read('app/src-tauri/src/cli_bridge.rs'),
  read('app/src/features/context/rlm/contextRlmProduction.ts'),
  read('app/src/features/context/rlm/rlmOpenCodeTool.ts'),
  read('app/src/lib/mcp/builtins.ts'),
  read('app/src/stores/auth.ts'),
  read('app/src/lib/harness/CredentialHydrationSnapshot.ts'),
  read('app/src/lib/harness/openCodeNativeTransport.ts'),
  read('app/src-tauri/src/harness/server.rs'),
  read('app/src/lib/harness/runtimeManager.ts'),
]);

assert.match(router, /openCodePersistentAdapter/);
assert.doesNotMatch(router, /import \{ openCodeCliAdapter \} from '\.\/adapters\/opencode'/);
assert.match(persistent, /harnessRuntimeManager/);
assert.match(persistent, /createPersistentOpenCodeRuntimeSupervisor/);
assert.match(persistent, /nativeOpenCodeRequest/);
assert.match(persistent, /nativeOpenCodeEvents/);
assert.doesNotMatch(
  persistent,
  /basicAuthorization|Authorization:\s*this\.handle|globalThis\.fetch/,
);
assert.match(nativeTransport, /opencode_server_request/);
assert.match(nativeTransport, /opencode_server_event_stream/);
assert.doesNotMatch(nativeTransport, /Authorization|Basic|baseUrl|password/);
assert.match(server, /rename_all_fields = "camelCase"/);
assert.match(server, /OpenCodeTransportRoute/);
assert.match(server, /basic_auth\(&connection\.username, Some\(&connection\.password\)\)/);
assert.match(server, /transport_caller_allowed/);
assert.match(server, /task\.abort\(\)/);
assert.match(
  runtimeManager,
  /version: string;\s*source: 'system' \| 'managed';\s*generation: string;/s,
);
assert.doesNotMatch(runtimeManager, /baseUrl: string;|username: string;|password: string;/);
assert.doesNotMatch(persistent, /'serve'/);
assert.doesNotMatch(persistent, /args:\s*\['run'/);
assert.match(
  persistent,
  /const nextEventOrEof = \(\): Promise<IteratorResult<OpenCodeRawEvent>> =>\s*eventIterator\.next\(\)\.catch\(\(\) => \(\{ done: true, value: undefined \}\)\)/s,
);
assert.match(persistent, /let pendingEvent = nextEventOrEof\(\)/);
assert.match(persistent, /pendingEvent\.then/);
assert.match(
  persistent,
  /pendingEvent = new Promise<IteratorResult<OpenCodeRawEvent>>\(\(\) => undefined\)/,
);
assert.match(persistent, /pendingEvent = nextEventOrEof\(\)/);
assert.match(persistent, /sessions\.sessionForChat/);
assert.match(persistent, /assertObservedModelMatches/);
assert.match(persistent, /vibespace_context: !input\.explicitReadRoot && input\.rlmEnabled/);
assert.match(
  persistent,
  /bounded\.vibespace_context =\s*!input\.explicitReadRoot && input\.rlmEnabled && input\.requested\.vibespace_context === true/s,
);
assert.doesNotMatch(persistent, /vibespace_context\.query/);
assert.match(legacy, /diagnostics-only|diagnostic/i);
assert.match(composer, /runtimeSettings: runtimePolicy\.settings/);
assert.match(composer, /accessLevel: runtimePolicy\.access/);
assert.match(composer, /approveAllForRun: runtimePolicy\.approveAllForRun/);
for (const command of ['fast', 'performance', 'rlm', 'access', 'approveall']) {
  assert.match(commands, new RegExp(`cmd: '${command}'`));
}
assert.match(runtime, /prepareProductionRlmContext/);
assert.match(runtime, /runtimeSettings,/);
assert.match(runtime, /VibeSpace Context route/);
assert.match(rlmProduction, /new RlmCoordinator/);
assert.match(rlmProduction, /new ContextPointerAuthority/);
assert.match(rlmProduction, /retrieveLiveRepositoryContext/);
assert.match(rlmTool, /name: 'vibespace_context\.query'/);
assert.match(mcpBuiltins, /toolRegistry\.register\(createRlmOpenCodeTool\(\)\)/);
assert.match(auth, /credentialHydrationSnapshot\.hydrate/);
assert.match(auth, /credentialHydrationSnapshot\.mergeVerified/);
assert.match(credentialSnapshot, /mergeVerified\(/);
assert.match(picker, /openCodePersistentAdapter\.listModels/);
assert.match(rust, /MAX_TIMEOUT_MS: u64 = 86_400_000/);

console.log('PR31 OpenCode/RLM production wiring invariants: PASS');
