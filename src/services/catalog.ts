import { getActiveSopBySlug, listActiveSops } from "../data/sops";
import type { SopDefinition } from "../data/sops/types";

export function listCatalog(): SopDefinition[] {
  return listActiveSops();
}

export function findSopOrThrow(slug: string): SopDefinition {
  const sop = getActiveSopBySlug(slug);
  if (!sop) {
    const err = new Error("Training not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  return sop;
}
