// Turns a photo someone picks into a small square profile picture (D18, 2026-10-04): centre-cropped, 128×128,
// JPEG, a few KB. Done in the browser so the original photo (and its location data) never leaves the device.

import { AVATAR_IMAGE_MAX_LENGTH } from '@dropabop/shared';

const SIZE = 128;

export class AvatarImageError extends Error {}

export async function toAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new AvatarImageError('Please choose a photo (JPEG, PNG, or WebP).');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarImageError('That photo couldn’t be opened. Please try a JPEG or PNG.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new AvatarImageError('Your browser couldn’t process that photo.');
  }
  // Centre square crop, scaled down to 128×128.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  // Lower the quality until it fits (most photos fit first time).
  for (const quality of [0.85, 0.75, 0.65, 0.5, 0.35]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= AVATAR_IMAGE_MAX_LENGTH) return dataUrl;
  }
  throw new AvatarImageError('That photo is too detailed to shrink enough. Please try another.');
}
