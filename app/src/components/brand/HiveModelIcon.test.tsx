import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HiveModelIcon, HIVE_MODEL_ICON_SRC } from './HiveModelIcon';

describe('HiveModelIcon', () => {
  it('renders the official hive model asset path', () => {
    render(<HiveModelIcon size={36} />);
    const img = screen.getByRole('img', { name: 'Hive model' });
    expect(img.getAttribute('src')).toBe(HIVE_MODEL_ICON_SRC);
    expect(img.getAttribute('width')).toBe('36');
  });
});
