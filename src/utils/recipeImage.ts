// Recipe photos uploaded as PNG come without a background, so they are drawn whole, as cut-outs.
// Any other photo keeps its background and is cropped to fill its frame.
const CUTOUT_PATTERN = /\.png(?:$|[?#])/i;

/** The recipe photo's URL when it is a cut-out without background, or null. */
export const getRecipeCutoutUri = (imageUrl: string | null | undefined): string | null => {
  const url = imageUrl?.trim();
  return url && CUTOUT_PATTERN.test(url) ? url : null;
};
