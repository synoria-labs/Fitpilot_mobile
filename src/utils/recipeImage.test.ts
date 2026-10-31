import { describe, expect, it } from 'vitest';
import { getRecipeCutoutUri } from './recipeImage';

describe('getRecipeCutoutUri', () => {
  it('treats PNG photos as cut-outs', () => {
    expect(getRecipeCutoutUri('https://cdn.fitpilot.fit/recipes/4/24/bowl.png')).toBe(
      'https://cdn.fitpilot.fit/recipes/4/24/bowl.png',
    );
    expect(getRecipeCutoutUri('https://cdn.fitpilot.fit/recipes/bowl.PNG?v=2')).toBe(
      'https://cdn.fitpilot.fit/recipes/bowl.PNG?v=2',
    );
  });

  it('keeps photos with a background, and missing ones, out', () => {
    expect(getRecipeCutoutUri('https://cdn.fitpilot.fit/recipes/4/24/bowl.jpg')).toBeNull();
    expect(getRecipeCutoutUri('https://cdn.fitpilot.fit/recipes/png/bowl.jpg')).toBeNull();
    expect(getRecipeCutoutUri(null)).toBeNull();
    expect(getRecipeCutoutUri('  ')).toBeNull();
  });
});
