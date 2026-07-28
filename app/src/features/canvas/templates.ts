import {
  createCanvasBlock,
  createCanvasDocument,
  withBlockAdded,
  withPlacement,
  type CanvasBlockContent,
  type CanvasDocument,
} from './contracts';
import { createMindMap } from './mindmaps';
import type { CanvasBackground, CanvasLayoutMode } from './contracts';

export const BUILT_IN_CANVAS_TEMPLATE_IDS = [
  'blank',
  'project-planner',
  'product-roadmap',
  'software-architecture',
  'system-design',
  'user-journey',
  'mind-map',
  'concept-map',
  'storyboard',
  'cornell-notes',
  'research-board',
  'launch-checklist',
  'calendar-planner',
  'content-tracker',
] as const;

export type BuiltInCanvasTemplateId = (typeof BUILT_IN_CANVAS_TEMPLATE_IDS)[number];

export interface CanvasTemplateBlock {
  readonly content: CanvasBlockContent;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface CanvasTemplate {
  readonly id: BuiltInCanvasTemplateId;
  readonly title: string;
  readonly layoutMode: CanvasLayoutMode;
  readonly background: CanvasBackground;
  readonly blocks: readonly CanvasTemplateBlock[];
}

export interface InstantiateCanvasTemplateInput {
  readonly documentId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly now: number;
}

function recipe(
  id: BuiltInCanvasTemplateId,
  title: string,
  layoutMode: CanvasLayoutMode,
  labels: readonly string[],
): CanvasTemplate {
  const blocks: readonly CanvasTemplateBlock[] = labels.map((text) => ({
    content: { kind: 'note', text },
  }));
  return Object.freeze({
    id,
    title,
    layoutMode,
    background: Object.freeze({
      kind: layoutMode === 'edgeless' ? 'dots' : 'plain',
      color: '#ffffff',
    }),
    blocks: Object.freeze(blocks),
  });
}

const BUILT_INS: readonly CanvasTemplate[] = Object.freeze([
  recipe('blank', 'Blank canvas', 'edgeless', []),
  recipe('project-planner', 'Project planner', 'page', ['Goal', 'Milestones', 'Risks']),
  recipe('product-roadmap', 'Product roadmap', 'edgeless', ['Now', 'Next', 'Later']),
  recipe('software-architecture', 'Software architecture', 'edgeless', [
    'Clients',
    'Application',
    'Data and integrations',
  ]),
  recipe('system-design', 'System design', 'edgeless', [
    'Requirements',
    'Components',
    'Trade-offs',
  ]),
  recipe('user-journey', 'User journey', 'edgeless', ['Discover', 'Decide', 'Complete']),
  recipe('mind-map', 'Mind map', 'edgeless', ['Central idea']),
  recipe('concept-map', 'Concept map', 'edgeless', ['Concept', 'Relationship', 'Evidence']),
  recipe('storyboard', 'Storyboard', 'page', ['Scene 1', 'Scene 2', 'Scene 3']),
  recipe('cornell-notes', 'Cornell notes', 'page', ['Cues', 'Notes', 'Summary']),
  recipe('research-board', 'Research board', 'edgeless', ['Question', 'Sources', 'Findings']),
  recipe('launch-checklist', 'Launch checklist', 'page', ['Prepare', 'Verify', 'Launch']),
  recipe('calendar-planner', 'Calendar planner', 'page', ['This week', 'Upcoming', 'Later']),
  recipe('content-tracker', 'Content tracker', 'page', ['Ideas', 'In progress', 'Published']),
]);

function generatedBlockId(documentId: string, index: number): string {
  const suffix = `-block-${index + 1}`;
  return `${documentId.slice(0, 64 - suffix.length)}${suffix}`;
}

function generatedMindMapContent(blockId: string, label: string, now: number): CanvasBlockContent {
  const suffix = blockId.slice(0, 48);
  return {
    kind: 'mind-map',
    map: createMindMap({
      id: `map-${suffix}`,
      rootId: `root-${suffix}`,
      label,
      now,
    }),
  };
}

export function listBuiltInCanvasTemplates(): readonly CanvasTemplate[] {
  return BUILT_INS;
}

export function instantiateCanvasTemplate(
  template: CanvasTemplate,
  input: InstantiateCanvasTemplateInput,
): CanvasDocument {
  let document = createCanvasDocument({
    id: input.documentId,
    projectId: input.projectId,
    ownerId: input.ownerId,
    title: template.title,
    layoutMode: template.layoutMode,
    background: template.background,
    now: input.now,
  });

  template.blocks.forEach((recipeBlock, index) => {
    const id = generatedBlockId(input.documentId, index);
    const content =
      template.id === 'mind-map' && index === 0
        ? generatedMindMapContent(
            id,
            recipeBlock.content.kind === 'note' ? recipeBlock.content.text : 'Mind map',
            input.now,
          )
        : recipeBlock.content;
    document = withBlockAdded(
      document,
      createCanvasBlock({ id, content, now: input.now }),
      input.now,
    );
    if (template.layoutMode === 'edgeless') {
      document = withPlacement(
        document,
        {
          blockId: id,
          x: recipeBlock.x ?? index * 360,
          y: recipeBlock.y ?? 0,
          width: recipeBlock.width ?? 300,
          height: recipeBlock.height ?? 180,
        },
        input.now,
      );
    }
  });

  return document;
}
