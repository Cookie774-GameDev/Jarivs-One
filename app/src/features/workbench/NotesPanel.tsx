import * as React from 'react';
import { toast } from '@/components/ui/toast';
import type { WorkbenchPanel } from './types';
import { WorkbenchSaveControls } from './WorkbenchSaveControls';
import {
  isWorkbenchDesktopSavePath,
  loadWorkbenchDocument,
  overwriteWorkbenchDocument,
  saveWorkbenchDocument,
  type WorkbenchSavedFile,
} from './workbenchLocalFiles';

interface NotesPanelProps {
  panel: WorkbenchPanel;
  onUpdate: (patch: Partial<WorkbenchPanel>) => void;
}

/**
 * Workbench Notes with Desktop save + Open-saved dropdown.
 * Save overwrites an open file; Save As creates a named copy.
 */
export function NotesPanel({ panel, onUpdate }: NotesPanelProps) {
  const note = panel.settings.note ?? '';
  const filePath = panel.settings.filePath;
  const [saving, setSaving] = React.useState(false);
  const [baseline, setBaseline] = React.useState(note);

  const hasExistingFile = Boolean(filePath && !filePath.startsWith('download://'));
  const dirty = note !== baseline;
  const displayLabel = filePath
    ? filePath.split(/[/\\]/).pop() || 'Notes'
    : panel.title || 'Notes';

  React.useEffect(() => {
    // When opening a file, baseline tracks loaded content.
    setBaseline(note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const handleSave = async () => {
    if (!filePath || filePath.startsWith('download://')) return;
    setSaving(true);
    try {
      if (isWorkbenchDesktopSavePath(filePath)) {
        const result = await overwriteWorkbenchDocument(filePath, note);
        if (!result.ok) {
          toast.warning('Save failed', result.reason);
          return;
        }
      } else {
        const result = await overwriteWorkbenchDocument(filePath, note);
        if (!result.ok) {
          toast.warning('Save failed', result.reason);
          return;
        }
      }
      setBaseline(note);
      onUpdate({ status: 'ready', settings: { ...panel.settings, note } });
      toast.success('Saved', displayLabel);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async (name: string) => {
    setSaving(true);
    try {
      const result = await saveWorkbenchDocument({
        kind: 'notes',
        displayName: name,
        content: note,
        extension: 'txt',
      });
      if (!result.ok) {
        toast.warning('Save failed', result.reason);
        return;
      }
      setBaseline(note);
      onUpdate({
        title: result.entry.name.slice(0, 80) || panel.title,
        settings: {
          ...panel.settings,
          filePath: result.path.startsWith('download://') ? undefined : result.path,
          note,
        },
        status: 'ready',
      });
      toast.success(
        'Saved as',
        result.path.startsWith('download://')
          ? result.entry.fileName
          : `Desktop\\VibeSpace\\notes\\${result.entry.fileName}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async (entry: WorkbenchSavedFile) => {
    const loaded = await loadWorkbenchDocument(entry.path);
    if (!loaded.ok) {
      toast.warning('Could not open', loaded.reason);
      return;
    }
    const next = loaded.content.slice(0, 20_000);
    setBaseline(next);
    onUpdate({
      title: entry.name.slice(0, 80),
      settings: {
        ...panel.settings,
        note: next,
        filePath: entry.path,
      },
      status: 'ready',
    });
    toast.success('Opened', entry.fileName);
  };

  return (
    <div className="workbench-notes" data-testid="workbench-notes-panel">
      <div className="workbench-notes-toolbar">
        <span className="workbench-notes-title" title={displayLabel}>
          {displayLabel}
          {dirty ? ' •' : ''}
        </span>
        <WorkbenchSaveControls
          kind="notes"
          suggestedName={displayLabel.replace(/\.[^.]+$/, '') || 'notes'}
          hasExistingFile={hasExistingFile}
          dirty={dirty}
          saving={saving}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onOpenSaved={handleOpen}
        />
      </div>
      <textarea
        className="workbench-note-editor"
        aria-label={`${panel.title} content`}
        placeholder="Capture decisions, links, and next steps…"
        value={note}
        onChange={(event) =>
          onUpdate({
            settings: { ...panel.settings, note: event.target.value.slice(0, 20_000) },
            status: 'busy',
          })
        }
        onWheel={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </div>
  );
}
