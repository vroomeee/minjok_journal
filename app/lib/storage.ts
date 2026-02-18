export function extractStorageObjectPath(
  urlOrPath: string | null | undefined,
  bucket: string,
): string | null {
  if (!urlOrPath) return null;

  const value = urlOrPath.trim();
  if (!value) return null;

  // Already an object path (not a URL).
  if (!/^https?:\/\//i.test(value)) {
    if (value.startsWith(`${bucket}/`)) {
      return value.slice(bucket.length + 1);
    }
    return value.replace(/^\/+/, "") || null;
  }

  try {
    const parsed = new URL(value);
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
    ];

    for (const marker of markers) {
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const rawPath = parsed.pathname.slice(markerIndex + marker.length);
        return rawPath ? decodeURIComponent(rawPath) : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function collectStorageObjectPaths(
  urlsOrPaths: Array<string | null | undefined>,
  bucket: string,
): string[] {
  const paths = urlsOrPaths
    .map((entry) => extractStorageObjectPath(entry, bucket))
    .filter((path): path is string => Boolean(path));

  return Array.from(new Set(paths));
}
