import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const url = new URL('../js/cinematic-state.mjs', import.meta.url);
const state = existsSync(url) ? await import(url) : {};

test('changing route keeps the exact conversation and rejects unknown routes', () => {
  assert.equal(typeof state.changeRoute, 'function', 'model routing is not implemented');
  const conversation = [{ role: 'user', text: 'Map the release.' }];
  const next = state.changeRoute({ route: 'openai', conversation }, 'ollama');
  assert.equal(next.route, 'ollama');
  assert.strictEqual(next.conversation, conversation);
  assert.equal(state.changeRoute(next, 'unknown').route, 'ollama');
});

test('a workflow cannot advance past approval without an explicit approve event', () => {
  assert.equal(typeof state.transitionWorkflow, 'function', 'workflow is not implemented');
  let current = 'ready';
  for (let i = 0; i < 12; i++) current = state.transitionWorkflow(current, 'next');
  assert.equal(current, 'approval');
  assert.equal(state.transitionWorkflow('approval', 'approve'), 'complete');
  assert.equal(state.transitionWorkflow('ready', 'approve'), 'ready');
});

test('decline is terminal until reset and cannot be approved later', () => {
  assert.equal(typeof state.transitionWorkflow, 'function');
  assert.equal(state.transitionWorkflow('approval', 'decline'), 'declined');
  assert.equal(state.transitionWorkflow('declined', 'next'), 'declined');
  assert.equal(state.transitionWorkflow('declined', 'approve'), 'declined');
  assert.equal(state.transitionWorkflow('declined', 'reset'), 'ready');
});

test('plan summary includes Access once and computes shared pool maxima only for eligible tiers', () => {
  assert.equal(typeof state.planSummary, 'function', 'pricing summary is not implemented');
  assert.deepEqual(state.planSummary('spark'), { name:'Spark', total:20, addon:0, credits:1000, minutes:0, sms:0, sync:false, publishing:false });
  assert.deepEqual(state.planSummary('nova'), { name:'Nova', total:70, addon:50, credits:27500, minutes:275, sms:2750, sync:true, publishing:true });
  assert.equal(state.planSummary('supernova').total, 220);
  assert.equal(state.planSummary('invalid'), null);
});

test('map controls clamp zoom and pan to reachable bounds', () => {
  assert.equal(typeof state.clampMap, 'function');
  assert.deepEqual(state.clampMap({x:999,y:-999,zoom:9}),{x:120,y:-80,zoom:1.5});
  assert.deepEqual(state.clampMap({x:0,y:0,zoom:0}),{x:0,y:0,zoom:0.75});
});
