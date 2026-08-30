import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SERVER_PATH = new URL('../app/src-tauri/src/harness/server.rs', import.meta.url);
const PLUGIN_START = 'const TOOL_GATEWAY_PLUGIN: &str = r#"';
const PLUGIN_END = '"#;\n\nfn write_tool_gateway_plugin';
const POINTER_START = 'const contextPointer = () =>';
const POINTER_END = '\n\nasync function call';

const EXPECTED_POINTER = `const contextPointer = () => tool.schema.union([
  tool.schema.object({
    id: text(512),
    recordId: text(512),
    byteStart: integer(Number.MAX_SAFE_INTEGER),
    byteEnd: integer(Number.MAX_SAFE_INTEGER),
    messageId: text(512).optional(),
    eventId: text(512).optional(),
    toolCallId: text(512).optional(),
    sourceVersion: text(512),
    contentHash: tool.schema.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  tool.schema.object({
    id: text(512),
    recordId: text(512),
    lineStart: integer(Number.MAX_SAFE_INTEGER),
    lineEnd: integer(Number.MAX_SAFE_INTEGER),
    messageId: text(512).optional(),
    eventId: text(512).optional(),
    toolCallId: text(512).optional(),
    sourceVersion: text(512),
    contentHash: tool.schema.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
])`;

function boundedSlice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${label} start marker must exist`);
  const contentStart = start + startMarker.length;
  const end = source.indexOf(endMarker, contentStart);
  assert.notEqual(end, -1, `${label} end marker must exist`);
  assert.equal(
    source.indexOf(startMarker, contentStart),
    -1,
    `${label} start marker must be unique`,
  );
  return source.slice(contentStart, end);
}

test('generated OpenCode pointers require exactly one complete span', async () => {
  const serverSource = (await readFile(SERVER_PATH, 'utf8')).replaceAll('\r\n', '\n');
  const pluginSource = boundedSlice(serverSource, PLUGIN_START, PLUGIN_END, 'plugin');
  const pointerSource = boundedSlice(pluginSource, POINTER_START, POINTER_END, 'pointer');

  assert.equal(`${POINTER_START}${pointerSource}`, EXPECTED_POINTER);
  assert.doesNotMatch(
    pluginSource,
    /(?:byteStart|byteEnd|lineStart|lineEnd): integer\(Number\.MAX_SAFE_INTEGER\)\.optional\(\)/u,
  );
});
