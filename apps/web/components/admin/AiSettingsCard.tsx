"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "../../lib/api";
import {
  mergeModelOptions,
  formatWibTimestamp,
  type AiSettings,
  type AiSettingsResponse,
} from "../../lib/ai-models";
import { ModelDropdown } from "./ModelDropdown";

type AiSettingsCardProps = {
  availableModels: readonly string[];
  hasCachedModels: boolean;
  onSettingsUpdated?: (response: { settings: AiSettings; isCustomized: boolean }) => void;
};

const EMPTY_WORKSPACE_OPTION = {
  value: "",
  label: "Ikuti mode Fast / Normal / Think",
  description: "Pemilihan otomatis berdasarkan mode respons",
};

const EMPTY_CLASSIFIER_OPTION = {
  value: "",
  label: "Otomatis (gunakan model Fast)",
  description: "Memakai model pada tier Fast",
};

export function AiSettingsCard({
  availableModels,
  hasCachedModels,
  onSettingsUpdated,
}: AiSettingsCardProps) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [isCustomized, setIsCustomized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const onSettingsUpdatedRef = useRef(onSettingsUpdated);

  useEffect(() => {
    onSettingsUpdatedRef.current = onSettingsUpdated;
  }, [onSettingsUpdated]);

  useEffect(() => {
    let active = true;
    api<AiSettingsResponse>("/v1/admin/ai/settings")
      .then((data) => {
        if (!active) return;
        setSettings(data.settings);
        setIsCustomized(data.isCustomized);
        setLoadError("");
        setDirty(false);
        onSettingsUpdatedRef.current?.({ settings: data.settings, isCustomized: data.isCustomized });
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setLoadError(
          caught instanceof Error
            ? caught.message
            : "Pengaturan model AET AI gagal dimuat dari server.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadTick]);

  const busy = saving || resetting;

  function updateEffortModel(key: "fast" | "normal" | "think", value: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      effortModels: { ...settings.effortModels, [key]: value },
    });
    setDirty(true);
  }

  function updatePersonaModel(key: "daily" | "report" | "coding", value: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      personaModels: { ...settings.personaModels, [key]: value || null },
    });
    setDirty(true);
  }

  function updateFeature(
    key: keyof AiSettings["features"],
    checked: boolean,
  ) {
    if (!settings) return;
    setSettings({
      ...settings,
      features: { ...settings.features, [key]: checked },
    });
    setDirty(true);
  }

  async function submitSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings || busy) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await api<{ settings: AiSettings; isCustomized: boolean }>(
        "/v1/admin/ai/settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            effortModels: settings.effortModels,
            personaModels: settings.personaModels,
            visionModelId: settings.visionModelId,
            classifierModelId: settings.classifierModelId,
            features: settings.features,
          }),
        },
      );
      setSettings(response.settings);
      setIsCustomized(response.isCustomized);
      setDirty(false);
      onSettingsUpdated?.(response);
      setFeedback({
        error: false,
        message: "Pengaturan model dan fitur AET AI berhasil disimpan dan langsung aktif di /chat.",
      });
    } catch (caught: unknown) {
      setFeedback({
        error: true,
        message:
          caught instanceof Error
            ? caught.message
            : "Pengaturan model AET AI gagal disimpan.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefaults() {
    if (busy) return;
    setResetting(true);
    setFeedback(null);
    try {
      const response = await api<{ settings: AiSettings; isCustomized: boolean }>(
        "/v1/admin/ai/settings",
        {
          method: "DELETE",
          body: "{}",
        },
      );
      setSettings(response.settings);
      setIsCustomized(response.isCustomized);
      setDirty(false);
      onSettingsUpdated?.(response);
      setFeedback({
        error: false,
        message: "Pengaturan AET AI dikembalikan ke konfigurasi bawaan server.",
      });
    } catch (caught: unknown) {
      setFeedback({
        error: true,
        message:
          caught instanceof Error
            ? caught.message
            : "Gagal mengatur ulang pengaturan AET AI.",
      });
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="admin-ai-settings-card" aria-label="Pengaturan model yang digunakan pada AET AI">
      <div className="admin-ai-settings-head">
        <div className="admin-ai-settings-title">
          <div className="admin-ai-settings-heading-row">
            <span className="admin-ai-settings-icon" aria-hidden="true">
              <SlidersHorizontal size={17} />
            </span>
            <h2>Pengaturan model AET AI</h2>
            <span className={`admin-status ${isCustomized ? "is-published" : "is-draft"}`}>
              {isCustomized ? "Konfigurasi kustom" : "Bawaan server"}
            </span>
          </div>
          <p>
            Atur model Sumopod untuk tingkat respons (<strong>Fast</strong>, <strong>Normal</strong>,{" "}
            <strong>Think</strong>), mode workspace, analisis gambar (<strong>Vision</strong>), serta fitur
            routing &amp; orkestrasi pada AET AI.
          </p>
        </div>
        {settings?.updatedAt && (
          <span className="admin-ai-settings-updated">
            Diperbarui {formatWibTimestamp(settings.updatedAt)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="admin-ai-settings-state" role="status">
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          <span>Memuat pengaturan aktif AET AI…</span>
        </div>
      ) : loadError || !settings ? (
        <div className="admin-ai-settings-error-state" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Gagal memuat pengaturan AET AI</strong>
            <p>{loadError || "Respons pengaturan tidak lengkap."}</p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setLoading(true);
              setLoadError("");
              setReloadTick((n) => n + 1);
            }}
          >
            Coba lagi
          </button>
        </div>
      ) : (
        <form onSubmit={submitSettings} className="admin-ai-settings-form" aria-label="Form pengaturan model AET AI">
          {feedback && (
            <div
              role={feedback.error ? "alert" : "status"}
              className={`admin-feedback ${feedback.error ? "admin-feedback-error" : "admin-feedback-success"} admin-feedback-banner`}
            >
              <div className="admin-feedback-content">
                {feedback.error ? (
                  <AlertCircle size={17} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={17} aria-hidden="true" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button
                type="button"
                className="admin-feedback-dismiss"
                aria-label="Tutup notifikasi pengaturan AET AI"
                onClick={() => setFeedback(null)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="admin-ai-settings-grid">
            <div className="admin-ai-settings-group">
              <div className="admin-ai-group-header">
                <h3>
                  <Cpu size={15} aria-hidden="true" />
                  <span>Pemetaan model per mode</span>
                </h3>
                <span className="admin-ai-group-caption">
                  {hasCachedModels ? "Sumber daftar: cache Sumopod" : "Sumber daftar: bawaan server"}
                </span>
              </div>

              <div className="admin-ai-setting-block">
                <p className="admin-ai-block-label">Mode Respons (Effort)</p>
                <div className="admin-ai-setting-rows">
                  {(
                    [
                      {
                        key: "fast" as const,
                        label: "Fast",
                        meta: "Maks. 1.500 token · 5 langkah · batas 35 detik",
                      },
                      {
                        key: "normal" as const,
                        label: "Normal",
                        meta: "Maks. 3.500 token · 9 langkah · batas 60 detik",
                      },
                      {
                        key: "think" as const,
                        label: "Think",
                        meta: "Maks. 6.000 token · 10 langkah · batas 90 detik",
                      },
                    ]
                  ).map((item) => {
                    const labelId = `aet-effort-${item.key}-label`;
                    const hintId = `aet-effort-${item.key}-hint`;
                    return (
                      <div className="admin-ai-setting-row" key={item.key}>
                        <div className="admin-ai-setting-copy">
                          <span id={labelId} className="admin-ai-setting-name">
                            {item.label}
                          </span>
                          <small id={hintId}>{item.meta}</small>
                        </div>
                        <ModelDropdown
                          id={`aet-effort-${item.key}`}
                          labelId={labelId}
                          name={`effort-${item.key}`}
                          value={settings.effortModels[item.key]}
                          models={mergeModelOptions(availableModels, settings.effortModels[item.key])}
                          onChange={(nextValue) => updateEffortModel(item.key, nextValue)}
                          placeholder="Pilih model…"
                          hintId={hintId}
                          disabled={busy}
                          compact
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="admin-ai-setting-block">
                <p className="admin-ai-block-label">Mode Workspace (Persona)</p>
                <div className="admin-ai-setting-rows">
                  {(
                    [
                      {
                        key: "daily" as const,
                        label: "Smart Companion",
                        meta: "Diskusi umum, brainstorming, dan rencana belajar",
                      },
                      {
                        key: "report" as const,
                        label: "Academic Writer",
                        meta: "Penulisan akademik, laporan, dan analisis riset",
                      },
                      {
                        key: "coding" as const,
                        label: "Coding Expert",
                        meta: "Pemrograman, debugging, dan logika algoritma",
                      },
                    ]
                  ).map((item) => {
                    const labelId = `aet-persona-${item.key}-label`;
                    const hintId = `aet-persona-${item.key}-hint`;
                    const current = settings.personaModels[item.key] ?? "";
                    return (
                      <div className="admin-ai-setting-row" key={item.key}>
                        <div className="admin-ai-setting-copy">
                          <span id={labelId} className="admin-ai-setting-name">
                            {item.label}
                          </span>
                          <small id={hintId}>{item.meta}</small>
                        </div>
                        <ModelDropdown
                          id={`aet-persona-${item.key}`}
                          labelId={labelId}
                          name={`persona-${item.key}`}
                          value={current}
                          models={mergeModelOptions(availableModels, current)}
                          emptyOption={EMPTY_WORKSPACE_OPTION}
                          onChange={(nextValue) => updatePersonaModel(item.key, nextValue)}
                          placeholder="Ikuti Fast / Normal / Think"
                          hintId={hintId}
                          disabled={busy}
                          compact
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="admin-ai-setting-block">
                <div className="admin-ai-vision-head">
                  <p className="admin-ai-block-label">
                    <ImageIcon size={14} aria-hidden="true" />
                    <span>Analisis Gambar (Vision)</span>
                  </p>
                  <div className="admin-switch-wrap">
                    <label className="admin-switch-text" htmlFor="aet-vision-enabled">
                      {settings.features.visionEnabled ? "Aktif" : "Nonaktif"}
                    </label>
                    <div className="admin-switch">
                      <input
                        id="aet-vision-enabled"
                        type="checkbox"
                        role="switch"
                        aria-label="Analisis Gambar (Vision)"
                        checked={settings.features.visionEnabled}
                        disabled={busy}
                        onChange={(event) => updateFeature("visionEnabled", event.target.checked)}
                      />
                      <span className="admin-switch-track" aria-hidden="true" />
                    </div>
                  </div>
                </div>
                <div className="admin-ai-setting-row">
                  <div className="admin-ai-setting-copy">
                    <span id="aet-vision-model-label" className="admin-ai-setting-name">
                      Model Vision
                    </span>
                    <small id="aet-vision-model-hint">
                      {settings.features.visionEnabled
                        ? "Dipakai otomatis saat menyertakan gambar PNG, JPEG, atau WEBP."
                        : "Vision dimatikan. Permintaan bergambar akan ditolak dengan pesan jelas."}
                    </small>
                  </div>
                  <ModelDropdown
                    id="aet-vision-model"
                    labelId="aet-vision-model-label"
                    name="visionModelId"
                    value={settings.visionModelId}
                    models={mergeModelOptions(availableModels, settings.visionModelId)}
                    onChange={(nextValue) => {
                      setSettings({ ...settings, visionModelId: nextValue });
                      setDirty(true);
                    }}
                    placeholder="Pilih model vision…"
                    hintId="aet-vision-model-hint"
                    disabled={busy || !settings.features.visionEnabled}
                    compact
                  />
                </div>
              </div>
            </div>

            <div className="admin-ai-settings-group">
              <div className="admin-ai-group-header">
                <h3>
                  <Sparkles size={15} aria-hidden="true" />
                  <span>Routing &amp; pipeline server</span>
                </h3>
                <span className="admin-ai-group-caption">Kendali perilaku orkestrasi /v1/chat</span>
              </div>

              <div className="admin-ai-toggle-list">
                {(
                  [
                    {
                      key: "routerV2" as const,
                      title: "Hybrid Router v2",
                      description:
                        "Menilai domain tugas (coding, riset, kuantitatif), kebutuhan penalaran, serta ambang akurasi.",
                    },
                    {
                      key: "semanticClassifier" as const,
                      title: "Semantic Classifier",
                      description:
                        "Memanggil model ringan saat sinyal heuristik ambigu untuk menentukan tipe tugas.",
                      requires: !settings.features.routerV2 ? "Membutuhkan Hybrid Router v2" : undefined,
                    },
                    {
                      key: "promptPreparation" as const,
                      title: "Prompt Preparation",
                      description:
                        "Menambahkan panduan tugas terarah dan memangkas riwayat lama agar sesuai batas konteks.",
                    },
                    {
                      key: "multiModelOrchestration" as const,
                      title: "Multi-Model Orchestration",
                      description:
                        "Alur Planner, Generator, Reviewer, dan Reviser pada tugas kompleks (mode Normal/Think).",
                      requires: !settings.features.routerV2 ? "Membutuhkan Hybrid Router v2" : undefined,
                    },
                    {
                      key: "qualityEvaluation" as const,
                      title: "Quality Evaluation Gate",
                      description:
                        "Mengevaluasi draf dengan rubrik domain dan bukti sumber sebelum jawaban dikirim.",
                      requires:
                        !settings.features.routerV2 || !settings.features.multiModelOrchestration
                          ? "Membutuhkan Router v2 + Multi-Model Orchestration"
                          : undefined,
                    },
                  ]
                ).map((item) => (
                  <div className="admin-ai-toggle-item" key={item.key}>
                    <div className="admin-ai-toggle-text">
                      <label htmlFor={`aet-flag-${item.key}`}>{item.title}</label>
                      <small id={`aet-flag-${item.key}-desc`}>{item.description}</small>
                      {item.requires && <span className="admin-ai-dependency-note">{item.requires}</span>}
                    </div>
                    <div className="admin-switch">
                      <input
                        id={`aet-flag-${item.key}`}
                        type="checkbox"
                        role="switch"
                        aria-describedby={`aet-flag-${item.key}-desc`}
                        checked={settings.features[item.key]}
                        disabled={busy}
                        onChange={(event) => updateFeature(item.key, event.target.checked)}
                      />
                      <span className="admin-switch-track" aria-hidden="true" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="admin-ai-setting-block">
                <p className="admin-ai-block-label">Model Semantic Classifier (Opsional)</p>
                <div className="admin-ai-setting-row">
                  <div className="admin-ai-setting-copy">
                    <span id="aet-classifier-model-label" className="admin-ai-setting-name">
                      Model Klasifikasi
                    </span>
                    <small id="aet-classifier-model-hint">
                      {settings.features.routerV2 && settings.features.semanticClassifier
                        ? "Dipakai saat permintaan kompleks memiliki banyak domain atau sinyal ambigu."
                        : "Aktif ketika Hybrid Router v2 dan Semantic Classifier dinyalakan."}
                    </small>
                  </div>
                  <ModelDropdown
                    id="aet-classifier-model"
                    labelId="aet-classifier-model-label"
                    name="classifierModelId"
                    value={settings.classifierModelId ?? ""}
                    models={mergeModelOptions(availableModels, settings.classifierModelId)}
                    emptyOption={EMPTY_CLASSIFIER_OPTION}
                    onChange={(nextValue) => {
                      setSettings({ ...settings, classifierModelId: nextValue || null });
                      setDirty(true);
                    }}
                    placeholder="Otomatis (gunakan model Fast)"
                    hintId="aet-classifier-model-hint"
                    disabled={busy}
                    compact
                  />
                </div>
              </div>

              <div className="admin-static-note admin-ai-bounds-note" role="note">
                <Info size={16} aria-hidden="true" />
                <span>
                  Batas kontrak tetap berlaku: maks. 4 lampiran per pesan (PDF/DOCX/TXT/gambar), konteks
                  maks. 160.000 karakter, dan pencarian web opsional via Tavily.
                </span>
              </div>
            </div>
          </div>

          <div className="admin-ai-settings-footer">
            <div className="admin-ai-settings-actions">
              <button type="submit" className="button button-primary" disabled={busy}>
                {saving ? (
                  <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save size={17} aria-hidden="true" />
                )}
                {saving ? "Menyimpan…" : "Simpan pengaturan"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => void resetToDefaults()}
              >
                {resetting ? (
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw size={16} aria-hidden="true" />
                )}
                Reset bawaan
              </button>
            </div>
            <span className="admin-model-selection-note">
              {dirty
                ? "Ada perubahan yang belum disimpan"
                : isCustomized
                  ? "Konfigurasi kustom sedang diterapkan pada AET AI"
                  : "Menggunakan pemetaan dan flag bawaan server"}
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
