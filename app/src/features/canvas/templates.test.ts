import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_CANVAS_TEMPLATE_IDS,
  instantiateCanvasTemplate,
  listBuiltInCanvasTemplates,
} from './templates';

describe('Canvas templates', () => {
  it('exposes the required built-in templates as real canvas document recipes', () => {
    const templates = listBuiltInCanvasTemplates();

    expect(templates.map((template) => template.id)).toEqual(BUILT_IN_CANVAS_TEMPLATE_IDS);
    expect(templates).toHaveLength(14);
    expect(templates.find((template) => template.id === 'blank')?.blocks).toHaveLength(0);
    expect(
      templates
        .filter((template) => template.id !== 'blank')
        .every((template) => template.blocks.length > 0),
    ).toBe(true);
  });

  it('instantiates a template into a newly scoped canonical document', () => {
    const template = listBuiltInCanvasTemplates().find(
      (candidate) => candidate.id === 'software-architecture',
    );
    expect(template).toBeDefined();

    const document = instantiateCanvasTemplate(template!, {
      documentId: 'canvas-new',
      projectId: 'project-new',
      ownerId: 'owner-new',
      now: 100,
    });

    expect(document).toMatchObject({
      id: 'canvas-new',
      projectId: 'project-new',
      ownerId: 'owner-new',
      title: 'Software architecture',
      layoutMode: 'edgeless',
    });
    expect(document.blocks.map((block) => block.id)).toEqual([
      'canvas-new-block-1',
      'canvas-new-block-2',
      'canvas-new-block-3',
    ]);
    expect(document.placements.map((placement) => placement.blockId)).toEqual(
      document.blocks.map((block) => block.id),
    );
  });
});
