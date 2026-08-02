import { describe, expect, it } from 'vitest';
import {
  buildJarvisSensitiveFallback,
  classifyJarvisSensitiveTopic,
  lintJarvisSensitiveProse,
  type JarvisSensitiveTopic,
} from './sensitive';

const TOPIC_REQUESTS = [
  ['crisis', 'I may hurt myself and need help now.'],
  ['crisis', 'I want to die and have a plan.'],
  ['crisis', "I don't want to live anymore."],
  ['crisis', "I'm going to shoot myself."],
  ['personal_safety', 'I was assaulted and need help.'],
  ['medical', 'Should I double my medication dose for these symptoms?'],
  ['medical', 'This may be a medical emergency.'],
  ['medical', 'How much ibuprofen can I take?'],
  ['legal', 'I need legal advice about a court filing deadline.'],
  ['legal', 'Can my landlord evict me tomorrow?'],
  ['financial', 'Should I invest my retirement savings in this crypto asset?'],
  ['financial', 'Should I put my life savings into Bitcoin?'],
  ['security', 'My account was hacked in a phishing attack. What should I do?'],
  ['security', 'I gave my password to a scammer.'],
  ['safety', 'There is a gas leak and an electrical hazard in the building.'],
  ['safety', 'I smell gas in my apartment.'],
] as const satisfies readonly (readonly [JarvisSensitiveTopic, string])[];

describe('sensitive response policy', () => {
  it.each(TOPIC_REQUESTS)('classifies %s guidance deterministically', (topic, userText) => {
    expect(classifyJarvisSensitiveTopic(userText)).toBe(topic);
  });

  it.each([
    'Explain the response-pipeline architecture.',
    'Summarize the quarterly financial report layout.',
    'Review the application security design.',
    'What does legal tender mean?',
    'Write a comedy about a doctor.',
    'Draft dialogue for a lawyer.',
    'Plot a stock chart from this CSV.',
    'Write a fictional crisis scene.',
    'I want to kill this background process.',
    'Should I sign the birthday card?',
  ])('does not overclassify ordinary informational text: %s', (userText) => {
    expect(classifyJarvisSensitiveTopic(userText)).toBeUndefined();
  });

  it.each([
    'crisis',
    'personal_safety',
    'medical',
    'legal',
    'financial',
    'security',
    'safety',
    'general',
  ] as const)('builds a complete deterministic %s fallback', (topic) => {
    const fallback = buildJarvisSensitiveFallback(topic);

    expect(lintJarvisSensitiveProse(fallback, topic)).toEqual([]);
    expect(fallback).not.toMatch(/\bsir\b|joke|funny|humou?r/i);
    expect(
      fallback.split(/[.!?]+(?:\s+|$)/).filter((item) => item.trim()).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('marks every missing sensitive safety component deterministic', () => {
    expect(lintJarvisSensitiveProse('Take two tablets.', 'medical')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'sensitive_closed_response_required',
          disposition: 'deterministic',
        }),
        expect.objectContaining({
          code: 'sensitive_uncertainty_missing',
          disposition: 'deterministic',
        }),
        expect.objectContaining({
          code: 'sensitive_safety_context_missing',
          disposition: 'deterministic',
        }),
        expect.objectContaining({
          code: 'sensitive_professional_help_missing',
          disposition: 'deterministic',
        }),
      ]),
    );
  });

  it('never accepts unsafe prose that merely contains positive-sounding policy tokens', () => {
    expect(
      lintJarvisSensitiveProse(
        'I cannot diagnose this remotely. Double your medication dose now, even if symptoms are severe. Never contact a doctor.',
        'medical',
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: 'sensitive_closed_response_required',
        disposition: 'deterministic',
      }),
    );
  });

  it.each([
    ['medical', 'You may double the medication dose. Ask a doctor.'],
    ['legal', 'You may sign the court form. Ask a lawyer.'],
    ['financial', 'You may invest the retirement savings. Ask an accountant.'],
    ['security', 'You may keep using the compromised account. Contact the security team.'],
  ] as const)(
    'does not mistake permissive %s guidance for uncertainty or safety context',
    (topic, prose) => {
      const codes = lintJarvisSensitiveProse(prose, topic).map((item) => item.code);

      expect(codes).toContain('sensitive_uncertainty_missing');
      expect(codes).toContain('sensitive_safety_context_missing');
    },
  );

  it('requires emergency guidance for an immediate crisis', () => {
    expect(
      lintJarvisSensitiveProse(
        'I cannot assess your immediate safety. Stay with someone you trust and speak with a qualified mental-health professional.',
        'crisis',
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: 'sensitive_emergency_help_missing',
        disposition: 'deterministic',
      }),
    );
  });
});
