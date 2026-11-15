"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Database,
  FlaskConical,
  Info,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "../../lib/api";

const MODEL_CACHE_KEY = "aet-ai:admin:sumopod-models:v1";
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const DEFAULT_MODEL_IDS = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-5-mini"] as const;

type CachedModels = {
  models: string[];
  reloadedAt: string;
  selectedModelId?: string;
};

type TestResult = {
  modelId: string;
  response?: string;
  error?: string;
  elapsedMs: number;
};

const wibDateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formatWibTimestamp(iso: string) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return `${wibDateTimeFormatter.format(new Date(time))} WIB`;
}

function sanitizeModelIds(values: unknown): string[] {
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

function readModelCache(): CachedModels | null {
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

function writeModelCache(payload: CachedModels): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function isControlUserInvalid(element: HTMLSelectElement | HTMLTextAreaElement) {
  try {
    return element.matches(":user-invalid");
  } catch {
    return !element.validity.valid;
  }
}

export function ModelTestPanel() {
  const [cachedCatalog, setCachedCatalog] = useState<CachedModels | null>(null);
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [reloading, setReloading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [modelInvalid, setModelInvalid] = useState(false);
  const [promptInvalid, setPromptInvalid] = useState(false);
  const [catalogFeedback, setCatalogFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = readModelCache();
    if (!stored) return;
    setCachedCatalog(stored);
    setModelId(stored.selectedModelId ?? stored.models[0] ?? "");
  }, []);

  const availableModels = cachedCatalog?.models.length ? cachedCatalog.models : [...DEFAULT_MODEL_IDS];
  const busy = reloading || testing;

  function handleSelectModel(nextId: string) {
    setModelId(nextId);
    if (cachedCatalog && nextId && cachedCatalog.models.includes(nextId)) {
      const updatedCache: CachedModels = { ...cachedCatalog, selectedModelId: nextId };
      setCachedCatalog(updatedCache);
      writeModelCache(updatedCache);
    }
  }

  async function reloadModels() {
    if (busy) return;
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
      const nextSelected = modelId && models.includes(modelId) ? modelId : models[0]!;
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
      setModelId(nextSelected);
      setModelInvalid(false);
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const chosenModel = modelId.trim();
    const chosenPrompt = prompt.trim();
    if (!chosenModel || !chosenPrompt) return;
    setTesting(true);
    setResult(null);
    setCopied(false);
    const start = performance.now();
    try {
      const response = await api<{ response: string; elapsedMs: number }>("/v1/admin/ai/model-test", {
        method: "POST",
        body: JSON.stringify({ modelId: chosenModel, prompt: chosenPrompt }),
      });
      setResult({
        modelId: chosenModel,
        response: response.response,
        elapsedMs: response.elapsedMs,
      });
    } catch (caught) {
      setResult({
        modelId: chosenModel,
        error: caught instanceof Error ? caught.message : "Pengujian model gagal.",
        elapsedMs: Math.round(performance.now() - start),
      });
    } finally {
      setTesting(false);
    }
  }

  async function copyResult() {
    if (!result?.response || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(result.response);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may be unavailable in restricted contexts.
    }
  }

  return (
    <div className="admin-ai-workspace">
      <section className="admin-model-panel" aria-label="Pengujian model Sumopod">
        <div className="admin-model-catalog-bar">
          <div className="admin-model-catalog-info">
            <div className="admin-model-catalog-title">
              <h2>Katalog model Sumopod</h2>
              <span className={`admin-model-source ${cachedCatalog ? "is-cached" : ""}`}>
                <Database size={12} aria-hidden="true" />
                {cachedCatalog
                  ? `Cache website · ${availableModels.length} model`
                  : `Kandidat awal · ${availableModels.length} model`}
              </span>
            </div>
            <p className="admin-model-catalog-meta">
              {cachedCatalog
                ? `Terakhir dimuat ulang ${formatWibTimestamp(cachedCatalog.reloadedAt)}`
                : "Ambil daftar ID model aktif akun operator dari https://ai.sumopod.com/v1/models."}
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary admin-reload-button"
            onClick={() => void reloadModels()}
            disabled={busy}
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

        <form onSubmit={submit} aria-label="Uji model AI" className="admin-model-form">
          <div className="admin-field">
            <label htmlFor="ai-model-id">Model ID</label>
            <div className="admin-select-wrap">
              <select
                id="ai-model-id"
                aria-label="Model ID"
                name="modelId"
                value={modelId}
                required
                aria-invalid={modelInvalid ? "true" : "false"}
                aria-describedby={modelInvalid ? "ai-model-error" : "ai-model-hint"}
                disabled={busy}
                onChange={(event) => {
                  handleSelectModel(event.target.value);
                  if (modelInvalid) {
                    setModelInvalid(isControlUserInvalid(event.currentTarget));
                  }
                }}
                onBlur={(event) => setModelInvalid(isControlUserInvalid(event.currentTarget))}
                onInvalid={(event) => setModelInvalid(isControlUserInvalid(event.currentTarget))}
              >
                <option value="" disabled>
                  {cachedCatalog
                    ? `Pilih dari ${availableModels.length} model Sumopod…`
                    : "Pilih ID model atau klik Reload model…"}
                </option>
                {availableModels.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              <ChevronDown size={17} aria-hidden="true" className="admin-select-icon" />
            </div>
            {modelInvalid ? (
              <small id="ai-model-error" className="admin-field-error">
                Pilih salah satu Model ID sebelum mengirim pengujian.
              </small>
            ) : (
              <small id="ai-model-hint">
                {cachedCatalog
                  ? "Pilihan dropdown bersumber dari Sumopod."
                  : "Menampilkan kandidat bawaan. Gunakan Reload model untuk memuat semua model dari akun Sumopod."}
              </small>
            )}
          </div>

          <div className="admin-field">
            <div className="admin-field-header">
              <label htmlFor="ai-prompt">Prompt singkat</label>
              <span className="admin-char-count">{prompt.length}/2000 karakter</span>
            </div>
            <textarea
              id="ai-prompt"
              aria-label="Prompt singkat"
              name="prompt"
              value={prompt}
              aria-invalid={promptInvalid ? "true" : "false"}
              aria-describedby={promptInvalid ? "ai-prompt-error" : undefined}
              placeholder="Tulis prompt uji singkat, misalnya pertanyaan definisi atau tes respons terstruktur…"
              onChange={(event) => {
                setPrompt(event.target.value);
                if (promptInvalid) {
                  setPromptInvalid(isControlUserInvalid(event.currentTarget));
                }
              }}
              onBlur={(event) => setPromptInvalid(isControlUserInvalid(event.currentTarget))}
              onInvalid={(event) => setPromptInvalid(isControlUserInvalid(event.currentTarget))}
              rows={5}
              required
              maxLength={2000}
              disabled={busy}
            />
            {promptInvalid && (
              <small id="ai-prompt-error" className="admin-field-error">
                Masukkan prompt singkat sebelum menguji model.
              </small>
            )}
          </div>

          <div className="admin-static-note admin-model-callout" role="note">
            <Info size={18} aria-hidden="true" />
            <span>
              Permintaan hanya dikirim saat Anda menekan <strong>Test</strong> atau{" "}
              <strong>Reload model</strong>, menggunakan koneksi Sumopod dan API key yang tersimpan di
              backend. Kelola kredit dan batas penggunaan langsung di Sumopod.
            </span>
          </div>

          <div className="admin-model-form-footer">
            <button type="submit" className="button button-primary" disabled={busy}>
              {testing ? (
                <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
              ) : (
                <FlaskConical size={17} aria-hidden="true" />
              )}
              {testing ? "Menguji…" : "Test"}
            </button>
            <span className="admin-model-selection-note">
              {modelId ? (
                <>
                  Model aktif: <code>{modelId}</code>
                </>
              ) : (
                "Belum ada model yang dipilih"
              )}
            </span>
          </div>
        </form>
      </section>

      <aside className="admin-ai-sidebar" aria-label="Hasil pengujian dan ringkasan konfigurasi">
        <div className="admin-model-result" aria-live="polite">
          <div className="admin-model-result-head">
            <h2>Hasil pengujian</h2>
            {result && (
              <span className={`admin-status ${result.error ? "is-error" : "is-published"}`}>
                {result.error ? (
                  <AlertCircle size={13} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={13} aria-hidden="true" />
                )}
                {result.error ? "Gagal" : "Berhasil"}
              </span>
            )}
          </div>

          {testing ? (
            <div className="admin-model-empty">
              <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
              <p>Mengirim prompt uji ke model {modelId}…</p>
            </div>
          ) : result ? (
            <>
              <div className="admin-model-result-meta">
                <span className="admin-slug-chip">{result.modelId}</span>
                <span className="admin-event-chip">
                  <Clock3 size={13} aria-hidden="true" />
                  <span>Waktu respons: {(result.elapsedMs / 1000).toFixed(2)} detik</span>
                </span>
                {result.response && (
                  <button
                    type="button"
                    className="admin-copy-button"
                    onClick={() => void copyResult()}
                  >
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    <span>{copied ? "Tersalin" : "Salin hasil"}</span>
                  </button>
                )}
              </div>
              {result.error ? (
                <p className="admin-feedback admin-feedback-error" role="alert">
                  {result.error}
                </p>
              ) : (
                <pre>{result.response}</pre>
              )}
            </>
          ) : (
            <div className="admin-model-empty">
              <FlaskConical size={20} aria-hidden="true" />
              <p>
                Belum ada pengujian dijalankan. Pilih ID model di panel kiri lalu tekan{" "}
                <strong>Test</strong> untuk melihat waktu respons dan keluaran model.
              </p>
            </div>
          )}
        </div>

        <section className="admin-model-meta-card" aria-label="Konfigurasi penyedia AI">
          <h2>Konfigurasi endpoint</h2>
          <dl className="admin-model-spec-list">
            <div>
              <dt>Daftar model</dt>
              <dd>
                <code>https://ai.sumopod.com/v1/models</code>
              </dd>
            </div>
            <div>
              <dt>Penyelesaian chat</dt>
              <dd>
                <code>https://ai.sumopod.com/v1/chat/completions</code>
              </dd>
            </div>
            <div>
              <dt>Cache website</dt>
              <dd>
                {cachedCatalog
                  ? `${cachedCatalog.models.length} model tersimpan (${formatWibTimestamp(cachedCatalog.reloadedAt)})`
                  : "Kosong (masih memakai kandidat bawaan)"}
              </dd>
            </div>
            <div>
              <dt>Batas uji manual</dt>
              <dd>Prompt maks. 2.000 karakter · Jawaban maks. 800 token</dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  );
}
