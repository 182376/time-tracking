import type { ClassificationBootstrapData } from "./classificationService";

let CLASSIFICATION_BOOTSTRAP_CACHE: ClassificationBootstrapData | null = null;

export function getClassificationBootstrapCache(): ClassificationBootstrapData | null {
  return CLASSIFICATION_BOOTSTRAP_CACHE;
}

export function setClassificationBootstrapCache(snapshot: ClassificationBootstrapData | null): void {
  CLASSIFICATION_BOOTSTRAP_CACHE = snapshot;
}
