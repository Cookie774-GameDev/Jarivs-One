import { describe, expect, it } from 'vitest';
import { getBuiltinAction } from './registry';

describe('schedule actions', () => {
  it('registers Jarvis schedule command actions', () => {
    expect(getBuiltinAction('schedule.create')?.category).toBe('schedule');
    expect(getBuiltinAction('schedule.list')?.category).toBe('schedule');
    expect(getBuiltinAction('schedule.pause')?.category).toBe('schedule');
    expect(getBuiltinAction('schedule.resume')?.category).toBe('schedule');
    expect(getBuiltinAction('schedule.delete')?.category).toBe('schedule');
    expect(getBuiltinAction('schedule.history')?.category).toBe('schedule');
  });

  it('marks destructive schedule actions as approval-gated', () => {
    expect(getBuiltinAction('schedule.delete')?.destructive).toBe(true);
    expect(getBuiltinAction('schedule.pause')?.destructive).toBe(true);
  });
});
