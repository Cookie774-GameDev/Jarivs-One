import * as React from 'react';
import { FolderOpen, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkbenchSavedFile, WorkbenchSaveKind } from './workbenchLocalFiles';
import { listCatalog, refreshCatalogFromDisk } from './workbenchLocalFiles';

interface WorkbenchSaveControlsProps {
  kind: WorkbenchSaveKind;
  /** Suggested name when opening Save As (without extension). */
  suggestedName?: string;
  /** True when a disk file is already open — Save overwrites it. */
  hasExistingFile?: boolean;
  /** Overwrite the currently open file (no rename). */
  onSave?: () => void | Promise<void>;
  /** Save under a new name (always prompts). */
  onSaveAs: (name: string) => void | Promise<void>;
  onOpenSaved: (entry: WorkbenchSavedFile) => void | Promise<void>;
  saving?: boolean;
  disabled?: boolean;
  dirty?: boolean;
}

/**
 * Workbench Save / Save As / Open bar.
 * - New file: Save → name field → create on Desktop
 * - Existing file: Save overwrites; Save As renames/copies with a new name
 */
export function WorkbenchSaveControls({
  kind,
  suggestedName = 'untitled',
  hasExistingFile = false,
  onSave,
  onSaveAs,
  onOpenSaved,
  saving = false,
  disabled = false,
  dirty = true,
}: WorkbenchSaveControlsProps) {
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState(suggestedName);
  const [entries, setEntries] = React.useState<WorkbenchSavedFile[]>(() => listCatalog(kind));
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reloadList = React.useCallback(async () => {
    const fromDisk = await refreshCatalogFromDisk(kind);
    setEntries(fromDisk.length ? fromDisk : listCatalog(kind));
  }, [kind]);

  React.useEffect(() => {
    void reloadList();
  }, [reloadList]);

  React.useEffect(() => {
    if (!naming) return;
    setName(suggestedName);
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [naming, suggestedName]);

  const commitSaveAs = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSaveAs(trimmed);
    setNaming(false);
    void reloadList();
  };

  const handlePrimarySave = () => {
    if (hasExistingFile && onSave) {
      void onSave();
      return;
    }
    setNaming(true);
  };

  return (
    <div className="workbench-save-controls" data-testid={`workbench-save-controls-${kind}`}>
      {naming ? (
        <div className="workbench-save-name-row">
          <input
            ref={inputRef}
            aria-label="Save file name"
            className="workbench-save-name-input"
            value={name}
            maxLength={80}
            placeholder="File name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitSaveAs();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setNaming(false);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="accent"
            disabled={saving || !name.trim()}
            onClick={() => void commitSaveAs()}
          >
            <Save /> Save as
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setNaming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="accent"
            disabled={disabled || saving || (hasExistingFile && !dirty)}
            aria-label={hasExistingFile ? 'Save' : 'Save as'}
            title={
              hasExistingFile
                ? 'Save changes to the open file'
                : 'Save to Desktop with a name'
            }
            onClick={handlePrimarySave}
          >
            <Save /> Save
          </Button>
          {hasExistingFile ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled || saving}
              aria-label="Save as"
              title="Save a copy with a new name"
              onClick={() => setNaming(true)}
            >
              Save as
            </Button>
          ) : null}
          <label className="workbench-save-open">
            <FolderOpen aria-hidden="true" />
            <span className="sr-only">Open saved file</span>
            <select
              aria-label="Open saved file"
              disabled={disabled || saving}
              value=""
              onFocus={() => void reloadList()}
              onChange={(e) => {
                const path = e.target.value;
                if (!path) return;
                const entry = entries.find((x) => x.path === path);
                if (entry) void onOpenSaved(entry);
                e.currentTarget.value = '';
              }}
            >
              <option value="">Open saved…</option>
              {entries.length === 0 ? (
                <option value="" disabled>
                  No saves yet
                </option>
              ) : (
                entries.map((entry) => (
                  <option key={entry.id} value={entry.path}>
                    {entry.fileName}
                  </option>
                ))
              )}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
