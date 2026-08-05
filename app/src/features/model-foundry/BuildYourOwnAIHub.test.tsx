import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BuildYourOwnAIHub } from './BuildYourOwnAIHub';
import { saveJobs, TRAINABLE_MODELS } from './modelHub';

describe('BuildYourOwnAIHub', () => {
  it('disables training methods without an installed verified worker', async () => {
    render(<BuildYourOwnAIHub open onOpenChange={vi.fn()} />);

    expect(
      (screen.getByRole('button', { name: /^LoRA fine-tuning/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: /^QLoRA fine-tuning/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: /Advanced full fine-tuning/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getAllByText(/LoRA requires a verified isolated training worker/i).length,
    ).toBeGreaterThan(0);
  });

  it('activates only a verified completed artifact', () => {
    saveJobs(window.localStorage, [
      {
        id: 'job_12345',
        name: 'Release specialist',
        baseModelId: TRAINABLE_MODELS[0].id,
        method: 'knowledge',
        status: 'completed',
        progress: 100,
        artifactPath: 'C:\\private\\knowledge-artifact.json',
        artifactVerified: true,
        createdAt: '1',
        updatedAt: '2',
      },
    ]);
    const onActivateArtifact = vi.fn();
    render(
      <BuildYourOwnAIHub open onOpenChange={vi.fn()} onActivateArtifact={onActivateArtifact} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'View model library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Release specialist with this agent' }));
    expect(onActivateArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job_12345', artifactVerified: true }),
    );
  });

  it('discloses hardware compatibility, runtime format, and the supported build path', () => {
    render(<BuildYourOwnAIHub open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getAllByText(/Q4_K_M \(4-bit inference\)/)).toHaveLength(TRAINABLE_MODELS.length);
    expect(screen.getAllByText(/Supported build path: Knowledge\/RAG/)).toHaveLength(
      TRAINABLE_MODELS.length,
    );
    expect(screen.getByText(/Operating system:/)).toBeTruthy();
    expect(screen.getByText(/GPU:/)).toBeTruthy();
    expect(screen.getByText(/Acceleration:/)).toBeTruthy();
  });
});
