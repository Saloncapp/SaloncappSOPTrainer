import { hydrafacial } from "./hydrafacial";
import { managerClientHandling } from "./managerClientHandling";
import { stylistClientHandling } from "./stylistClientHandling";
import type { SopDefinition } from "./types";

const catalog: SopDefinition[] = [
  hydrafacial,
  managerClientHandling,
  stylistClientHandling,
];

export function listActiveSops(): SopDefinition[] {
  return catalog
    .filter((s) => s.isActive)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getSopBySlug(slug: string): SopDefinition | null {
  const key = (slug || "").trim().toLowerCase();
  return catalog.find((s) => s.slug === key) ?? null;
}

export function getActiveSopBySlug(slug: string): SopDefinition | null {
  const sop = getSopBySlug(slug);
  if (!sop || !sop.isActive) return null;
  return sop;
}
