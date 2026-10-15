/** Provider results can contain raw base64; browser image sources need a URL. */
export function toPdpImageSource(image: string | null | undefined, mimeType?: string): string {
  const source = image?.trim() ?? "";
  if (!source || /^(data:image\/|blob:|https?:\/\/)/i.test(source)) return source;
  const base64 = source.replace(/\s+/g, "");
  // Detect JPEG before treating a leading slash as an asset path.
  const detectedMime = base64.startsWith("iVBORw0KGgo") ? "image/png"
    : base64.startsWith("/9j/") ? "image/jpeg"
    : base64.startsWith("UklGR") ? "image/webp"
    : base64.startsWith("R0lGOD") ? "image/gif" : undefined;
  if (!detectedMime && (source.startsWith("/") || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))) return source;
  const mime = detectedMime ?? (mimeType?.startsWith("image/") ? mimeType : "image/jpeg");
  return `data:${mime};base64,${base64}`;
}
