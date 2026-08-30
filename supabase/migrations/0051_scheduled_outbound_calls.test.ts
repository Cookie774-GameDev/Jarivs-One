import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const sql = readFileSync(new URL('./0051_scheduled_outbound_calls.sql', import.meta.url), 'utf8');

describe('scheduled outbound call migration authority', () => {
  it('binds one account-owned schedule to immutable approved call truth', () => {
    assert.match(sql, /create table if not exists public\.scheduled_outbound_calls/i);
    assert.match(sql, /call_job_id uuid not null unique/i);
    assert.match(sql, /approval_fingerprint text not null/i);
    assert.match(sql, /destination_phone_e164 text not null/i);
    assert.match(sql, /purpose text not null/i);
    assert.match(sql, /revision bigint not null default 1/i);
  });

  it('claims due work with row locks, exact revision, live approval, and single dispatch token', () => {
    assert.match(sql, /create or replace function public\.claim_scheduled_outbound_call/i);
    assert.match(sql, /for update/i);
    assert.match(sql, /v_schedule\.revision <> p_expected_revision/i);
    assert.match(sql, /v_schedule\.scheduled_for > now\(\)/i);
    assert.match(sql, /outbound_call_approvals/i);
    assert.match(sql, /dispatch_token = gen_random_uuid\(\)/i);
    assert.match(sql, /claim_expires_at = now\(\) \+ interval '2 minutes'/i);
    assert.match(sql, /status = 'dispatching' and v_schedule\.claim_expires_at <= now\(\)/i);
    assert.match(sql, /v_job\.status not in \('approved','credits_reserved'\)/i);
    assert.match(
      sql,
      /v_job\.status in \('queued','dialing','ringing','in_progress','completed'\)/i,
    );
  });

  it('cancels the exact still-scheduled row and its bound job in one transaction', () => {
    assert.match(sql, /create or replace function public\.cancel_scheduled_outbound_call/i);
    assert.match(sql, /v_schedule\.status <> 'scheduled'/i);
    assert.match(sql, /update public\.outbound_call_jobs[\s\S]*status = 'cancelled'/i);
    assert.match(sql, /revision = revision \+ 1/i);
  });
});
