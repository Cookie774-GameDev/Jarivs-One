import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('Tooltip MonoChrome appearance', () => {
  it('keeps ordinary-theme elevation while removing it in MonoChrome', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Open tooltip</TooltipTrigger>
          <TooltipContent data-testid="tooltip-content">Visible tooltip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const tooltip = screen.getByTestId('tooltip-content');
    expect(tooltip.className).toContain('shadow-lg');
    expect(tooltip.className).toContain('[html[data-theme=monochrome]_&]:shadow-none');
    expect(tooltip.className).toContain('[html[data-theme=monochrome]_&]:animate-none');
  });
});
