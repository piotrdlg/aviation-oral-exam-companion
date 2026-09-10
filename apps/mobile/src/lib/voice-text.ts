const TTS_LIMIT = 2000;

/** Preserve every word while keeping each request within the server's TTS cap. */
export function splitUtterance(text: string): string[] {
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length > TTS_LIMIT) {
    const window = remaining.slice(0, TTS_LIMIT + 1);
    const boundaries = [...window.matchAll(/[.!?]["')\]]?\s+/g)];
    const boundary = boundaries.at(-1);
    let cut = boundary ? boundary.index! + boundary[0].trimEnd().length : window.lastIndexOf(' ', TTS_LIMIT);
    if (cut < 1) cut = TTS_LIMIT;
    // Avoid splitting a UTF-16 surrogate pair at a forced boundary.
    if (/[\uD800-\uDBFF]/.test(remaining[cut - 1])) cut--;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}
