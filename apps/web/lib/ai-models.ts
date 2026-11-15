export const MODEL_CACHE_KEY = "aet-ai:admin:sumopod-models:v1";
export const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
export const DEFAULT_MODEL_IDS = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-5-mini"] as const;

export type CachedModels = {
  models: string[];
  reloadedAt: string;
  selectedModelId?: string;
};

export type AiFeatureSettings = {
  routerV2: boolean;
  semanticClassifier: boolean;
  promptPreparation: boolean;
  multiModelOrchestration: boolean;
  qualityEvaluation: boolean;
  visionEnabled: boolean;
};

export type AiSettings = {
  effortModels: {
    fast: string;
    normal: string;
    think: string;
  };
  personaModels: {
    daily: string | null;
    report: string | null;
    coding: string | null;
  };
  visionModelId: string;
  classifierModelId: string | null;
  features: AiFeatureSettings;
  updatedAt?: string;
};

export type AiSettingsResponse = {
  settings: AiSettings;
  isCustomized: boolean;
  defaults?: AiSettings;
};

const wibDateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export function formatWibTimestamp(iso: string) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return `${wibDateTimeFormatter.format(new Date(time))} WIB`;
}

export function sanitizeModelIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  for (const entry of values) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (id && id.length <= 160 && MODEL_ID_PATTERN.test(id)) {
      seen.add(id);
    }
  }
  return [...seen];
}

export function readModelCache(): CachedModels | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MODEL_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const models = sanitizeModelIds(record.models);
    if (!models.length) return null;
    const reloadedAt =
      typeof record.reloadedAt === "string" && !Number.isNaN(Date.parse(record.reloadedAt))
        ? record.reloadedAt
        : "";
    if (!reloadedAt) return null;
    const selectedModelId =
      typeof record.selectedModelId === "string" && models.includes(record.selectedModelId)
        ? record.selectedModelId
        : undefined;
    return { models, reloadedAt, selectedModelId };
  } catch {
    return null;
  }
}

export function writeModelCache(payload: CachedModels): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function mergeModelOptions(models: readonly string[], current?: string | null): string[] {
  const cleanCurrent = typeof current === "string" ? current.trim() : "";
  if (!cleanCurrent || models.includes(cleanCurrent)) return [...models];
  return [cleanCurrent, ...models];
}
