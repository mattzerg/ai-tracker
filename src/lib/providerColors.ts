// Shared provider color palette. Used by ProviderMark (rendered initial squares)
// and OG cards (stripe accent on model share cards). Single source of truth so
// the palette stays coherent across surfaces.

export const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#cc785c",
  google: "#4285f4",
  openai: "#10a37f",
  xai: "#111111",
  meta: "#0866ff",
  mistral: "#ff7000",
  deepseek: "#4d6bfe",
  alibaba: "#ff6a00",
  cohere: "#39594d",
};

export function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

export function providerColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? hashColor(provider);
}
