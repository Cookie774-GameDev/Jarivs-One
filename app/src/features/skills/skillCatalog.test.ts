import { beforeEach, describe, expect, it } from 'vitest';
import { SKILLS } from '@/lib/agents/skills';
import {
  getAllCatalogSkills,
  getUnifiedSkillManifests,
  resolveCatalogSkill,
  resolveCatalogSkills,
} from './skillCatalog';
import { useSkillsStore } from './skillsStore';

describe('skillCatalog', () => {
  beforeEach(() => {
    useSkillsStore.setState({
      customSkills: [],
      presetOverrides: {},
      deletedPresets: [],
    });
  });

  it('seeds the five built-in presets in the unified manifest list', () => {
    const manifests = getUnifiedSkillManifests();
    expect(manifests.filter((m) => m.isPreset)).toHaveLength(5);
    expect(manifests.map((m) => m.catalogId).sort()).toEqual(Object.keys(SKILLS).sort());
  });

  it('merges custom skills after presets', () => {
    const id = useSkillsStore.getState().addCustomSkill({ name: 'Deploy', description: 'Ship it' });
    const skills = getAllCatalogSkills();
    expect(skills.some((s) => s.id === id)).toBe(true);
    expect(skills.length).toBe(6);
  });

  it('applies preset overrides to resolveCatalogSkill', () => {
    useSkillsStore.getState().setPresetOverride('build', {
      name: 'Build wizard',
      systemPromptAddendum: 'Always run tests.',
    });
    const skill = resolveCatalogSkill('build');
    expect(skill?.name).toBe('Build wizard');
    expect(skill?.systemPromptAddendum).toBe('Always run tests.');
  });

  it('resolveCatalogSkills preserves order and drops unknown ids', () => {
    const ids = ['create', 'missing', 'research'];
    const resolved = resolveCatalogSkills(ids);
    expect(resolved.map((s) => s.id)).toEqual(['create', 'research']);
  });

  it('maps legacy preset ids to the new five-skill catalog', () => {
    const resolved = resolveCatalogSkills(['coding', 'terminal', 'writing', 'summarization']);
    expect(resolved.map((s) => s.id)).toEqual(['build', 'operate', 'create', 'analyze']);
  });

  it('does not resolve disabled presets or custom skills for runtime injection', () => {
    const customId = useSkillsStore.getState().addCustomSkill({ name: 'Quiet', description: 'Disabled' });
    useSkillsStore.getState().setSkillEnabled('build', false, 'preset');
    useSkillsStore.getState().setSkillEnabled(customId, false, 'custom');

    expect(resolveCatalogSkill('build')).toBeUndefined();
    expect(resolveCatalogSkill(customId)).toBeUndefined();
    expect(resolveCatalogSkills(['coding', customId])).toEqual([]);
  });

  it('deleted presets are omitted from catalog lists', () => {
    useSkillsStore.getState().deletePreset('operate');
    expect(getAllCatalogSkills().some((s) => s.id === 'operate')).toBe(false);
    expect(getUnifiedSkillManifests().some((m) => m.catalogId === 'operate')).toBe(false);
  });

  it('restoreAllPresets brings back deleted presets', () => {
    useSkillsStore.getState().deletePreset('analyze');
    useSkillsStore.getState().restoreAllPresets();
    expect(getAllCatalogSkills().some((s) => s.id === 'analyze')).toBe(true);
  });
});
