import type { ChatRequest, Effort, Persona } from '@aet/contracts';
import { z } from 'zod';
import { AiError } from './errors.js';
import { MODEL_CATALOG, type ModelSpec } from './models.js';
import { getModelRegistry } from './models/registry.js';
import { selectModels, type Classification } from './router.js';
import {
  AI_MULTI_MODEL_ORCHESTRATION,
  AI_PROMPT_PREPARATION,
  AI_QUALITY_EVALUATION,
  AI_ROUTER_V2,
  AI_SEMANTIC_CLASSIFIER,
} from './routing/feature-flags.js';
import { selectModelsHybrid, type TaskProfile } from './routing/hybrid-router.js';

export const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

const modelIdSchema = z.string().trim().min(1).max(160).regex(MODEL_ID_PATTERN);
const optionalModelIdSchema = z.union([modelIdSchema, z.null()]);

export const aiFeaturesSchema = z.object({
  routerV2: z.boolean(),
  semanticClassifier: z.boolean(),
  promptPreparation: z.boolean(),
  multiModelOrchestration: z.boolean(),
  qualityEvaluation: z.boolean(),
  visionEnabled: z.boolean(),
}).strict();

export const aiSettingsUpdateSchema = z.object({
  effortModels: z.object({
    fast: modelIdSchema,
    normal: modelIdSchema,
    think: modelIdSchema,
  }).strict(),
  personaModels: z.object({
    daily: optionalModelIdSchema,
    report: optionalModelIdSchema,
    coding: optionalModelIdSchema,
  }).strict(),
  visionModelId: modelIdSchema,
  classifierModelId: optionalModelIdSchema,
  features: aiFeaturesSchema,
}).strict();

export type AiFeatureSettings = z.infer<typeof aiFeaturesSchema>;
export type AiSettingsUpdate = z.infer<typeof aiSettingsUpdateSchema>;
export type AiSettings = AiSettingsUpdate & { updatedAt?: string };

export function defaultAiSettings(): AiSettings {
  return {
    effortModels: {
      fast: 'gpt-4o-mini',
      normal: 'gpt-4.1-mini',
      think: 'gpt-5-mini',
    },
    personaModels: {
      daily: null,
      report: null,
      coding: null,
    },
    visionModelId: 'gpt-4o-mini',
    classifierModelId: null,
    features: {
      routerV2: AI_ROUTER_V2,
      semanticClassifier: AI_SEMANTIC_CLASSIFIER,
      promptPreparation: AI_PROMPT_PREPARATION,
      multiModelOrchestration: AI_MULTI_MODEL_ORCHESTRATION,
      qualityEvaluation: AI_QUALITY_EVALUATION,
      visionEnabled: true,
    },
  };
}

export function resolveAiSettings(raw: unknown): AiSettings {
  const defaults = defaultAiSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const record = raw as Record<string, unknown>;
  const merged = {
    effortModels: {
      ...defaults.effortModels,
      ...(record.effortModels && typeof record.effortModels === 'object' ? record.effortModels : {}),
    },
    personaModels: {
      ...defaults.personaModels,
      ...(record.personaModels && typeof record.personaModels === 'object' ? record.personaModels : {}),
    },
    visionModelId: typeof record.visionModelId === 'string' ? record.visionModelId : defaults.visionModelId,
    classifierModelId: record.classifierModelId === null || typeof record.classifierModelId === 'string'
      ? record.classifierModelId
      : defaults.classifierModelId,
    features: {
      ...defaults.features,
      ...(record.features && typeof record.features === 'object' ? record.features : {}),
    },
  };
  const parsed = aiSettingsUpdateSchema.safeParse(merged);
  if (!parsed.success) return defaults;
  return {
    ...parsed.data,
    ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
  };
}

type ModelRoleTemplate = Effort | 'vision' | 'classifier';

export function effectiveModelSpec(
  id: string,
  role: ModelRoleTemplate,
  baseCatalog: readonly ModelSpec[] = MODEL_CATALOG,
): ModelSpec {
  const existing = baseCatalog.find(candidate => candidate.id === id);
  if (existing) {
    return role === 'vision' && !existing.vision
      ? { ...existing, vision: true, strengths: [...new Set([...existing.strengths, 'image'])] }
      : existing;
  }
  const outputTokenField = /^(?:gpt-5|o[134])/i.test(id) ? 'max_completion_tokens' as const : undefined;
  if (role === 'vision') {
    return {
      id,
      strengths: ['general', 'image'],
      speed: 'fast',
      vision: true,
      maxContextCharacters: 96_000,
      ...(outputTokenField ? { outputTokenField } : {}),
    };
  }
  if (role === 'think') {
    return {
      id,
      strengths: ['coding', 'math', 'research', 'general'],
      speed: 'deep',
      vision: false,
      maxContextCharacters: 96_000,
      ...(outputTokenField ? { outputTokenField } : {}),
    };
  }
  if (role === 'normal') {
    return {
      id,
      strengths: ['writing', 'coding', 'research', 'general'],
      speed: 'balanced',
      vision: false,
      maxContextCharacters: 96_000,
      ...(outputTokenField ? { outputTokenField } : {}),
    };
  }
  return {
    id,
    strengths: ['general'],
    speed: 'fast',
    vision: false,
    maxContextCharacters: 96_000,
    ...(outputTokenField ? { outputTokenField } : {}),
  };
}

export function selectModelsWithSettings(
  request: ChatRequest,
  task: Classification | TaskProfile,
  settings: AiSettings,
  baseCatalog: readonly ModelSpec[] = MODEL_CATALOG,
): ModelSpec[] {
  const registry = getModelRegistry(baseCatalog);
  const disabled = new Set(registry.filter(item => !item.enabled || item.availability === 'unavailable').map(item => item.id));

  if (task.requiredCapabilities.vision) {
    if (!settings.features.visionEnabled) {
      throw new AiError('VISION_UNAVAILABLE', 'Analisis gambar sedang dinonaktifkan oleh pengelola.', 422);
    }
    const primary = effectiveModelSpec(settings.visionModelId, 'vision', baseCatalog);
    const otherVision = baseCatalog.filter(model => model.vision && !disabled.has(model.id) && model.id !== primary.id);
    const visionCandidates = [primary, ...otherVision].filter(model => task.contextCharacters <= model.maxContextCharacters);
    if (!visionCandidates.length) {
      throw new AiError('CONTEXT_LIMIT', 'Konteks terlalu panjang untuk model gambar yang dikonfigurasi. Mulai percakapan baru atau ringkas lampiran.', 422);
    }
    return visionCandidates;
  }

  const personaOverrideId = settings.personaModels[request.persona as Persona];
  const effortModelId = settings.effortModels[request.effort];
  const baseRanked = settings.features.routerV2 && 'domain' in task
    ? selectModelsHybrid(task, request.effort, baseCatalog)
    : selectModels(task, request.effort, baseCatalog);

  const prioritized: ModelSpec[] = [];
  const seen = new Set<string>();
  const addCandidate = (candidate: ModelSpec) => {
    if (seen.has(candidate.id) || task.contextCharacters > candidate.maxContextCharacters) return;
    seen.add(candidate.id);
    prioritized.push(candidate);
  };

  if (personaOverrideId) {
    addCandidate(effectiveModelSpec(personaOverrideId, request.effort, baseCatalog));
  }
  addCandidate(effectiveModelSpec(effortModelId, request.effort, baseCatalog));
  for (const fallback of baseRanked) {
    if (!disabled.has(fallback.id)) addCandidate(fallback);
  }
  if (!prioritized.length) {
    throw new AiError('CONTEXT_LIMIT', 'Konteks terlalu panjang untuk model yang dikonfigurasi. Mulai percakapan baru atau ringkas lampiran.', 422);
  }
  return prioritized;
}

export function classifierModelForSettings(
  settings: AiSettings,
  baseCatalog: readonly ModelSpec[] = MODEL_CATALOG,
): ModelSpec {
  const targetId = settings.classifierModelId ?? settings.effortModels.fast;
  return effectiveModelSpec(targetId, 'classifier', baseCatalog);
}
