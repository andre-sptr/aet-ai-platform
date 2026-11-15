"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Database, RefreshCw, X } from "lucide-react";
import { api } from "../../lib/api";
import {
  DEFAULT_MODEL_IDS,
  formatWibTimestamp,
  readModelCache,
  sanitizeModelIds,
  writeModelCache,
  type AiSettings,
  type CachedModels,
} from "../../lib/ai-models";
import { AiSettingsCard } from "./AiSettingsCard";
import { ModelTestPanel } from "./ModelTestPanel";

export function AiAdminWorkspace() {
  const [cachedCatalog, setCachedCatalog] = useState<CachedModels | null>(null);
  const [reloading, setReloading] = useState(false);
  const [catalogFeedback, setCatalogFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [activeSettings, setActiveSettings] = useState<{ settings: AiSettings; isCustomized: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = readModelCache();
      if (stored) setCachedCatalog(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const availableModels = cachedCatalog?.models.length ? cachedCatalog.models : [...DEFAULT_MODEL_IDS];

  function handleSharedCatalogChange(nextCache: CachedModels) {
    setCachedCatalog(nextCache);
    writeModelCache(nextCache);
  }

  async function reloadModels() {
    if (reloading) return;
    setReloading(true);
    setCatalogFeedback(null);
    try {
      const response = await api<{ models: string[]; fetchedAt?: string }>("/v1/admin/ai/models/reload", {
        method: "POST",
        body: "{}",
      });
      const models = sanitizeModelIds(response.models);
      if (!models.length) {
        throw new Error("Daftar model dari akun Sumopod kosong.");
      }
      const nextSelected =
        cachedCatalog?.selectedModelId && models.includes(cachedCatalog.selectedModelId)
          ? cachedCatalog.selectedModelId
          : models[0]!;
      const reloadedAt =
        response.fetchedAt && !Number.isNaN(Date.parse(response.fetchedAt))
          ? response.fetchedAt
          : new Date().toISOString();
      const nextCache: CachedModels = {
        models,
        reloadedAt,
        selectedModelId: nextSelected,
      };
      const saved = writeModelCache(nextCache);
      setCachedCatalog(nextCache);
      setCatalogFeedback({
        error: false,
        message: saved
          ? `${models.length} ID model Sumopod berhasil dimuat ulang dan disimpan ke cache website.`
          : `${models.length} ID model dimuat ulang, tetapi cache browser tidak tersedia.`,
      });
    } catch (caught) {
      setCatalogFeedback({
        error: true,
        message: caught instanceof Error ? caught.message : "Daftar model Sumopod gagal dimuat ulang.",
      });
    } finally {
      setReloading(false);
    }
  }

  return (
    <div className="admin-ai-page">
      <section className="admin-ai-catalog-card" aria-label="Katalog model Sumopod">
        <div className="admin-model-catalog-bar admin-ai-catalog-banner">
          <div className="admin-model-catalog-info">
            <div className="admin-model-catalog-title">
              <h2>Katalog model Sumopod</h2>
              <span className={`admin-model-source ${cachedCatalog ? "is-cached" : ""}`}>
                <Database size={12} aria-hidden="true" />
                {cachedCatalog
                  ? `Cache website · ${availableModels.length} model`
                  : `Bawaan server · ${availableModels.length} model`}
              </span>
            </div>
            <p className="admin-model-catalog-meta">
              {cachedCatalog
                ? `Terakhir dimuat ulang ${formatWibTimestamp(cachedCatalog.reloadedAt)} · dipakai untuk dropdown model.`
                : "Muat daftar model aktif dari https://ai.sumopod.com/v1/models ke cache website."}
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary admin-reload-button"
            onClick={() => void reloadModels()}
            disabled={reloading}
          >
            <RefreshCw size={16} aria-hidden="true" className={reloading ? "animate-spin" : undefined} />
            {reloading ? "Memuat model…" : "Reload model"}
          </button>
        </div>

        {catalogFeedback && (
          <div
            role={catalogFeedback.error ? "alert" : "status"}
            className={`admin-feedback ${catalogFeedback.error ? "admin-feedback-error" : "admin-feedback-success"} admin-feedback-banner admin-model-feedback`}
          >
            <div className="admin-feedback-content">
              {catalogFeedback.error ? (
                <AlertCircle size={17} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={17} aria-hidden="true" />
              )}
              <span>{catalogFeedback.message}</span>
            </div>
            <button
              type="button"
              className="admin-feedback-dismiss"
              aria-label="Tutup notifikasi katalog model"
              onClick={() => setCatalogFeedback(null)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      <AiSettingsCard
        availableModels={availableModels}
        hasCachedModels={Boolean(cachedCatalog)}
        onSettingsUpdated={setActiveSettings}
      />

      <ModelTestPanel
        sharedCatalog={cachedCatalog}
        onSharedCatalogChange={handleSharedCatalogChange}
        showCatalogHeader={false}
        activeSettings={activeSettings}
      />
    </div>
  );
}
