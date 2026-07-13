import * as React from 'react';
import { Check, LayoutTemplate, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BUILT_IN_TEMPLATES } from './templates';
import { useWorkbenchStore } from './store';

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
}

export function TemplatePicker({ open, onClose }: TemplatePickerProps) {
  const applyTemplate = useWorkbenchStore((state) => state.applyTemplate);
  const saveTemplate = useWorkbenchStore((state) => state.saveTemplate);
  const deleteTemplate = useWorkbenchStore((state) => state.deleteTemplate);
  const customTemplates = useWorkbenchStore((state) => state.customTemplates);
  const [name, setName] = React.useState('');

  if (!open) return null;
  const templates = [...BUILT_IN_TEMPLATES, ...customTemplates];
  return (
    <div className="workbench-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="workbench-sheet workbench-template-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workbench-template-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p>Layout library</p>
            <h2 id="workbench-template-title">Workbench templates</h2>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Close templates" onClick={onClose}>
            <X />
          </Button>
        </header>
        <div className="workbench-template-grid">
          {templates.map((template) => (
            <article key={template.id}>
              <div className="workbench-template-map" aria-hidden="true">
                {template.panels.slice(0, 8).map((panel, index) => (
                  <span
                    key={`${panel.kind}-${index}`}
                    style={{
                      left: `${8 + ((panel.x / 1900) * 82)}%`,
                      top: `${8 + ((panel.y / 900) * 75)}%`,
                      width: `${Math.max(12, (panel.width / 1900) * 82)}%`,
                      height: `${Math.max(14, (panel.height / 900) * 75)}%`,
                    }}
                  />
                ))}
              </div>
              <div>
                <p>{template.builtIn ? 'Built in' : 'Your template'}</p>
                <h3>{template.name}</h3>
                <span>{template.description}</span>
              </div>
              <footer>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    applyTemplate(template.id);
                    onClose();
                  }}
                >
                  <Check /> Apply
                </Button>
                {!template.builtIn ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${template.name}`}
                    onClick={() => deleteTemplate(template.id)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
        <form
          className="workbench-save-template"
          onSubmit={(event) => {
            event.preventDefault();
            if (saveTemplate(name)) setName('');
          }}
        >
          <LayoutTemplate aria-hidden="true" />
          <label htmlFor="workbench-template-name">Save the current layout</label>
          <input
            id="workbench-template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My focused workspace"
            maxLength={120}
          />
          <Button type="submit" size="sm" disabled={!name.trim()}><Plus /> Save template</Button>
        </form>
      </section>
    </div>
  );
}
