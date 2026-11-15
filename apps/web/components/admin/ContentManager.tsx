"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Newspaper,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { API_BASE, api } from "../../lib/api";
import SafeImage, { safeImageUrl } from "../SafeImage";
import { AdminDialog } from "./AdminDialog";
import { emptyForm, formPayload, makeSlug, rowToForm, type ContentForm, type ContentKind, type ContentRow } from "./content";

const labels = {
  news: { heading: "Berita & artikel", description: "Kelola cerita dan informasi yang tampil di AET Journal.", singular: "berita", empty: "Belum ada berita. Mulai bagikan cerita dari komunitas." },
  events: { heading: "Kegiatan & agenda", description: "Susun informasi kegiatan, jadwal, dan lokasi untuk komunitas.", singular: "kegiatan", empty: "Belum ada kegiatan. Tambahkan agenda komunitas berikutnya." },
  team: { heading: "Tim & struktur", description: "Perbarui profil, jabatan, dan urutan anggota organisasi.", singular: "anggota", empty: "Belum ada anggota. Tambahkan profil pengurus organisasi." },
};

const wibDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const wibDateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const wibTimeOnlyFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

const wibDayFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  timeZone: "Asia/Jakarta",
});

const wibMonthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "short",
  timeZone: "Asia/Jakarta",
});

const wibDayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Jakarta",
});

function parseTimestamp(iso?: string | null): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

function formatUpdatedDate(iso?: string) {
  const time = parseTimestamp(iso);
  if (time === null) return "";
  return `${wibDateFormatter.format(new Date(time))} WIB`;
}

function formatEventSchedule(startIso?: string, endIso?: string | null) {
  const start = parseTimestamp(startIso);
  if (start === null) return "";
  const startDate = new Date(start);
  const startLabel = wibDateTimeFormatter.format(startDate);
  const end = parseTimestamp(endIso);
  if (end === null || end < start) return `${startLabel} WIB`;
  const endDate = new Date(end);
  const sameWibDay = wibDayKeyFormatter.format(startDate) === wibDayKeyFormatter.format(endDate);
  const endLabel = sameWibDay
    ? wibTimeOnlyFormatter.format(endDate)
    : wibDateTimeFormatter.format(endDate);
  return `${startLabel} - ${endLabel} WIB`;
}

function getEventScheduleBadge(row: ContentRow, now: number) {
  const start = parseTimestamp(row.startDate);
  if (start === null) return null;
  const end = parseTimestamp(row.endDate);
  if (start > now) return { label: "Akan datang", tone: "is-upcoming" as const };
  if (end !== null && end >= now) return { label: "Berlangsung", tone: "is-ongoing" as const };
  return { label: "Selesai", tone: "is-past" as const };
}

function formatWibInputDuration(startInput: string, endInput: string) {
  if (!endInput) return "Opsional. Kosongkan jika kegiatan tidak memiliki jam selesai pasti.";
  const startMs = parseTimestamp(startInput ? `${startInput}:00+07:00` : "");
  const endMs = parseTimestamp(`${endInput}:00+07:00`);
  if (startMs === null || endMs === null) {
    return "Pastikan format waktu mulai dan selesai sudah benar.";
  }
  if (endMs < startMs) return "Waktu selesai harus setelah waktu mulai.";
  const totalMinutes = Math.round((endMs - startMs) / 60_000);
  if (totalMinutes === 0) return "Waktu selesai sama dengan waktu mulai.";
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0) parts.push(`${minutes} menit`);
  return `Durasi kegiatan: ${parts.join(" ")}.`;
}

function getMemberInitials(name?: string) {
  if (!name) return "";
  const primaryName = name.split(",")[0]?.trim() ?? "";
  return primaryName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function parseSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

function parseTeamSocialEntries(socials: unknown): [string, string][] {
  if (!socials) return [];
  try {
    const parsed: unknown = typeof socials === "string" ? JSON.parse(socials) : socials;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const entries: [string, string][] = [];
    for (const [rawKey, rawValue] of Object.entries(parsed)) {
      const key = rawKey.trim();
      if (!key || typeof rawValue !== "string") continue;
      const safeHref = parseSafeHttpUrl(rawValue);
      if (safeHref) entries.push([key, safeHref]);
    }
    return entries;
  } catch {
    return [];
  }
}

function inspectSocialsJson(raw: string): { valid: boolean; entries: [string, string][]; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, entries: [], error: "" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      valid: false,
      entries: [],
      error: 'Format JSON belum valid. Gunakan kutip ganda, contoh: {"instagram":"https://instagram.com/aetpcr"}.',
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      valid: false,
      entries: [],
      error: "Tautan sosial harus berupa objek JSON dengan pasangan nama platform dan URL.",
    };
  }
  const entries: [string, string][] = [];
  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const key = rawKey.trim();
    if (!key) {
      return {
        valid: false,
        entries: [],
        error: "Setiap kunci platform di JSON tidak boleh kosong.",
      };
    }
    const safeHref = typeof rawValue === "string" ? parseSafeHttpUrl(rawValue) : null;
    if (!safeHref) {
      return {
        valid: false,
        entries: [],
        error: `URL untuk "${key}" harus berupa alamat http:// atau https:// yang valid.`,
      };
    }
    entries.push([key, safeHref]);
  }
  return { valid: true, entries, error: "" };
}

function isElementUserInvalid(element: HTMLInputElement | HTMLTextAreaElement) {
  try {
    return element.matches(":user-invalid");
  } catch {
    return !element.validity.valid;
  }
}

type StatusFilter = "all" | "published" | "draft" | "upcoming";

export function ContentManager({ kind }: { kind: ContentKind }) {
  const config = labels[kind];
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ContentRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ContentRow | null>(null);
  const [form, setForm] = useState<ContentForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});
  const [socialsInteracted, setSocialsInteracted] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api<ContentRow[]>(`/v1/admin/${kind}`)); }
    catch (caught) { setFeedback({ error: true, message: caught instanceof Error ? caught.message : "Data belum dapat dimuat." }); }
    finally { setLoading(false); }
  }, [kind]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { uploadAbortRef.current?.abort("unmount"); }, []);
  function open(row: ContentRow | "new") {
    uploadAbortRef.current?.abort("cancelled");
    setForm(row === "new" ? emptyForm() : rowToForm(row));
    setFormError("");
    setUploadNotice(null);
    setInvalidFields({});
    setSocialsInteracted(false);
    setEditing(row);
  }
  function closeEditor() {
    uploadAbortRef.current?.abort("cancelled");
    setUploadNotice(null);
    setEditing(null);
  }
  function syncFieldValidity(key: string, element: HTMLInputElement | HTMLTextAreaElement) {
    const isInvalid = isElementUserInvalid(element);
    setInvalidFields((current) => (current[key] === isInvalid ? current : { ...current, [key]: isInvalid }));
  }
  function update<K extends keyof ContentForm>(key: K, value: ContentForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy || uploading) return;
    setBusy(true); setFormError("");
    try {
      const payload = formPayload(kind, form);
      await api(`/v1/admin/${kind}${editing === "new" ? "" : `/${encodeURIComponent(editing.id)}`}`, { method: editing === "new" ? "POST" : "PATCH", body: JSON.stringify(payload) });
      setEditing(null); setFeedback({ error: false, message: `${config.singular[0].toUpperCase()}${config.singular.slice(1)} berhasil disimpan.` });
      await load();
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "Penyimpanan gagal. Coba lagi."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return; setBusy(true);
    try { await api(`/v1/admin/${kind}/${encodeURIComponent(deleting.id)}`, { method: "DELETE" }); setDeleting(null); setFeedback({ error: false, message: "Data berhasil dihapus." }); await load(); }
    catch (caught) { setFeedback({ error: true, message: caught instanceof Error ? caught.message : "Penghapusan gagal." }); setDeleting(null); }
    finally { setBusy(false); }
  }
  async function togglePublication(row: ContentRow) {
    setBusy(true);
    try { await api(`/v1/admin/${kind}/${encodeURIComponent(row.id)}`, { method: "PATCH", body: JSON.stringify({ published: !row.published }) }); setFeedback({ error: false, message: row.published ? "Konten dikembalikan ke draf." : "Konten dipublikasikan." }); await load(); }
    catch (caught) { setFeedback({ error: true, message: caught instanceof Error ? caught.message : "Status tidak dapat diubah." }); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file || busy || uploading) return;
    setUploadNotice(null);
    setFormError("");
    if (file.size > 5 * 1024 * 1024) {
      setUploadNotice({ kind: "error", message: "Gambar maksimal 5 MB." });
      return;
    }
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort("timeout"), 45_000);
    setUploading(true);
    try {
      const response = await fetch(`${API_BASE}/v1/uploads`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
      if (!response.ok || !data?.url) {
        if (response.status === 413) {
          throw new Error(data?.error?.message || "Ukuran gambar terlalu besar (maks. 5 MB atau melebihi batas unggahan server).");
        }
        throw new Error(data?.error?.message || "Gambar tidak dapat diunggah. Periksa koneksi atau konfigurasi penyimpanan.");
      }
      update(kind === "team" ? "photoUrl" : "imageUrl", data.url);
      setUploadNotice({ kind: "success", message: `Berhasil diunggah: ${file.name}` });
    } catch (caught) {
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
      const message =
        controller.signal.reason === "timeout"
          ? "Waktu unggah habis (45 detik). Periksa koneksi lalu coba lagi."
          : caught instanceof Error
            ? caught.message
            : "Unggah gambar gagal.";
      setUploadNotice({ kind: "error", message });
    } finally {
      clearTimeout(timeoutId);
      if (uploadAbortRef.current === controller) {
        uploadAbortRef.current = null;
      }
      setUploading(false);
    }
  }
  const now = Date.now();
  const publishedCount = kind === "team" ? 0 : rows.filter((row) => Boolean(row.published)).length;
  const draftCount = kind === "team" ? 0 : rows.length - publishedCount;
  const upcomingCount =
    kind === "events"
      ? rows.filter((row) => {
          const start = parseTimestamp(row.startDate);
          return start !== null && start > now;
        }).length
      : 0;
  const filtered = rows.filter((row) => {
    if (kind !== "team" && statusFilter !== "all") {
      if (statusFilter === "published" && !row.published) return false;
      if (statusFilter === "draft" && row.published) return false;
      if (statusFilter === "upcoming") {
        const start = parseTimestamp(row.startDate);
        if (start === null || start <= now) return false;
      }
    }
    const query = search.trim().toLocaleLowerCase("id");
    if (!query) return true;
    const socialSearchText = kind === "team" ? parseTeamSocialEntries(row.socials).map(([platform]) => platform).join(" ") : "";
    return `${row.title ?? row.name ?? ""} ${row.summary ?? ""} ${row.description ?? ""} ${row.bio ?? ""} ${row.location ?? ""} ${row.position ?? row.slug ?? ""} ${socialSearchText}`
      .toLocaleLowerCase("id")
      .includes(query);
  });
  const hasActiveFilter = Boolean(search.trim()) || (kind !== "team" && statusFilter !== "all");
  const slugPreview = kind === "news" ? (form.slug.trim() || makeSlug(form.title) || "slug-artikel") : "";
  const socialsStatus = kind === "team" ? inspectSocialsJson(form.socials) : { valid: true, entries: [] as [string, string][], error: "" };
  const socialsRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (kind === "team" && editing && socialsRef.current) {
      socialsRef.current.setCustomValidity(socialsStatus.error);
    }
  }, [kind, editing, socialsStatus.error]);
  const showSocialsError = Boolean(socialsInteracted && !socialsStatus.valid && socialsStatus.error);
  const formattedSocialsExample = '{\n  "instagram": "https://instagram.com/aetpcr",\n  "linkedin": "https://linkedin.com/company/aet-pcr"\n}';
  const formattedCurrentSocials = socialsStatus.valid && socialsStatus.entries.length > 0
    ? JSON.stringify(Object.fromEntries(socialsStatus.entries), null, 2)
    : "";
  const input = (
    key: keyof ContentForm,
    label: string,
    options: { required?: boolean; type?: string; wide?: boolean; hint?: string; maxLength?: number; autoFocus?: boolean; identifier?: boolean; min?: string } = {},
  ) => (
    <label className={`admin-field ${options.wide ? "admin-field-wide" : ""}`} key={key}>
      <span>{label}</span>
      {options.type === "textarea" ? (
        <textarea
          aria-label={label}
          aria-invalid={invalidFields[key] ? "true" : "false"}
          rows={key === "content" || key === "description" ? 10 : 4}
          value={String(form[key])}
          autoCorrect={options.identifier ? "off" : undefined}
          autoCapitalize={options.identifier ? "none" : undefined}
          spellCheck={options.identifier ? false : undefined}
          onChange={(event) => {
            update(key, event.target.value);
            if (invalidFields[key]) syncFieldValidity(key, event.currentTarget);
          }}
          onBlur={(event) => syncFieldValidity(key, event.currentTarget)}
          onInvalid={(event) => syncFieldValidity(key, event.currentTarget)}
          required={options.required}
          maxLength={options.maxLength}
          disabled={busy}
        />
      ) : (
        <input
          aria-label={label}
          aria-invalid={invalidFields[key] ? "true" : "false"}
          type={options.type ?? "text"}
          value={String(form[key])}
          autoFocus={options.autoFocus}
          autoCorrect={options.identifier ? "off" : undefined}
          autoCapitalize={options.identifier ? "none" : undefined}
          spellCheck={options.identifier ? false : undefined}
          onChange={(event) => {
            const value = options.type === "number" ? Number(event.target.value) : event.target.value;
            if (key === "title" && kind === "news" && editing === "new" && (!form.slug || form.slug === makeSlug(form.title))) {
              setForm((current) => ({ ...current, title: String(value), slug: makeSlug(String(value)) }));
            } else {
              update(key, value);
            }
            if (invalidFields[key]) syncFieldValidity(key, event.currentTarget);
          }}
          onBlur={(event) => syncFieldValidity(key, event.currentTarget)}
          onInvalid={(event) => syncFieldValidity(key, event.currentTarget)}
          required={options.required}
          maxLength={options.maxLength}
          min={options.min ?? (options.type === "number" ? 0 : undefined)}
          step={options.type === "number" ? 1 : undefined}
          disabled={busy}
        />
      )}
      {options.hint && <small>{options.hint}</small>}
    </label>
  );
  return <>
    <div className="admin-page-heading">
      <div>
        <p className="admin-eyebrow">Manajemen konten</p>
        <h1>{config.heading}</h1>
        <p>{config.description}</p>
      </div>
      <button type="button" className="button button-primary" onClick={() => open("new")}>
        <Plus size={17} aria-hidden="true" />
        Tambah {config.singular}
      </button>
    </div>

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
          aria-label="Tutup notifikasi"
          onClick={() => setFeedback(null)}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    )}

    <section className="admin-collection" aria-label={`Daftar ${config.singular}`}>
      <div className="admin-collection-toolbar">
        <div className="admin-toolbar-heading">
          <h2>
            Daftar {config.singular} <span>{rows.length}</span>
          </h2>
          {hasActiveFilter && !loading ? (
            <p className="admin-toolbar-summary">
              Menampilkan {filtered.length} dari {rows.length} {config.singular}
            </p>
          ) : kind === "team" && !loading && rows.length > 0 ? (
            <p className="admin-toolbar-summary">
              Urutan tampilan mengikuti angka terkecil ke terbesar
            </p>
          ) : null}
        </div>
        <div className="admin-toolbar-controls">
          {kind !== "team" && (
            <div className="admin-filter-group" role="group" aria-label="Filter status publikasi">
              <button
                type="button"
                className="admin-filter-pill"
                aria-pressed={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              >
                Semua <span>{rows.length}</span>
              </button>
              <button
                type="button"
                className="admin-filter-pill"
                aria-pressed={statusFilter === "published"}
                onClick={() => setStatusFilter("published")}
              >
                Terbit <span>{publishedCount}</span>
              </button>
              <button
                type="button"
                className="admin-filter-pill"
                aria-pressed={statusFilter === "draft"}
                onClick={() => setStatusFilter("draft")}
              >
                Draf <span>{draftCount}</span>
              </button>
              {kind === "events" && (
                <button
                  type="button"
                  className="admin-filter-pill"
                  aria-pressed={statusFilter === "upcoming"}
                  onClick={() => setStatusFilter("upcoming")}
                >
                  Akan datang <span>{upcomingCount}</span>
                </button>
              )}
            </div>
          )}
          <search className="admin-search-box">
            <label className="sr-only" htmlFor="admin-content-search">
              Cari {config.singular}
            </label>
            <Search size={16} aria-hidden="true" className="admin-search-icon" />
            <input
              id="admin-content-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Cari ${config.singular}…`}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </search>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading" role="status">
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          <span>Memuat data…</span>
        </div>
      ) : !filtered.length ? (
        <div className="admin-empty">
          <h3>{rows.length ? "Tidak ada hasil pencarian." : "Cerita berikutnya dimulai di sini."}</h3>
          <p>{rows.length ? "Coba kata kunci atau filter status lain." : config.empty}</p>
          <div className="admin-empty-actions">
            {rows.length > 0 && hasActiveFilter && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              >
                Reset filter
              </button>
            )}
            {feedback?.error && (
              <button type="button" className="button button-secondary" onClick={() => void load()}>
                Muat ulang
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className="admin-content-list">
          {filtered.map((row) => {
            const thumb = safeImageUrl(kind === "team" ? row.photoUrl : row.imageUrl);
            const updatedLabel = formatUpdatedDate(row.updatedAt ?? row.createdAt);
            const eventStart = kind === "events" ? parseTimestamp(row.startDate) : null;
            const eventSchedule = kind === "events" ? formatEventSchedule(row.startDate, row.endDate) : "";
            const eventBadge = kind === "events" ? getEventScheduleBadge(row, now) : null;
            const memberInitials = kind === "team" ? getMemberInitials(row.name) : "";
            const memberSocials = kind === "team" ? parseTeamSocialEntries(row.socials) : [];
            return (
              <li key={row.id}>
                <div className="admin-row-main">
                  {thumb ? (
                    <SafeImage
                      src={thumb}
                      alt=""
                      className={`admin-row-thumb ${kind === "team" ? "is-avatar" : ""}`}
                      label=""
                    />
                  ) : kind === "news" ? (
                    <div className="admin-row-thumb admin-row-thumb-empty" aria-hidden="true">
                      <Newspaper size={20} />
                    </div>
                  ) : kind === "events" && eventStart !== null ? (
                    <div className="admin-event-date-tile" aria-hidden="true">
                      <span>{wibMonthFormatter.format(new Date(eventStart))}</span>
                      <strong>{wibDayFormatter.format(new Date(eventStart))}</strong>
                    </div>
                  ) : kind === "events" ? (
                    <div className="admin-row-thumb admin-row-thumb-empty" aria-hidden="true">
                      <CalendarDays size={20} />
                    </div>
                  ) : (
                    <div className="admin-team-avatar-fallback" aria-hidden="true">
                      {memberInitials ? <span>{memberInitials}</span> : <Users size={20} />}
                    </div>
                  )}
                  <div className="admin-row-text">
                    <h3>{row.title ?? row.name}</h3>
                    {kind === "team" && row.position && (
                      <p className="admin-team-role">{row.position}</p>
                    )}
                    {kind === "news" && row.summary && (
                      <p className="admin-row-summary">{row.summary}</p>
                    )}
                    {kind === "events" && row.description && (
                      <p className="admin-row-summary">{row.description}</p>
                    )}
                    {kind === "team" && row.bio && (
                      <p className="admin-row-summary">{row.bio}</p>
                    )}
                    <div className="admin-row-meta">
                      {kind === "team" ? (
                        <>
                          <span className="admin-team-order">Urutan #{row.order ?? 0}</span>
                          {memberSocials.map(([platform, href]) => (
                            <a
                              key={platform}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="admin-social-chip"
                              aria-label={`${platform} ${row.name} (buka di tab baru)`}
                            >
                              <span>{platform}</span>
                              <ExternalLink size={11} aria-hidden="true" />
                            </a>
                          ))}
                        </>
                      ) : kind === "events" ? (
                        <>
                          {eventSchedule && (
                            <span className="admin-event-chip">
                              <Clock3 size={13} aria-hidden="true" />
                              <time dateTime={row.startDate}>{eventSchedule}</time>
                            </span>
                          )}
                          {row.location && (
                            <span className="admin-event-chip is-location">
                              <MapPin size={13} aria-hidden="true" />
                              <span>{row.location}</span>
                            </span>
                          )}
                          {eventBadge && (
                            <span className={`admin-schedule-pill ${eventBadge.tone}`}>
                              {eventBadge.label}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="admin-slug-chip">
                            {kind === "news" ? `/news/${row.slug}/` : `/${row.slug}/`}
                          </span>
                          {updatedLabel && (
                            <span className="admin-row-detail">Diperbarui {updatedLabel}</span>
                          )}
                        </>
                      )}
                      {kind !== "team" && (
                        <span className={`admin-status ${row.published ? "is-published" : ""}`}>
                          {row.published ? (
                            <CheckCircle2 size={13} aria-hidden="true" />
                          ) : (
                            <Clock3 size={13} aria-hidden="true" />
                          )}
                          {row.published ? "Terbit" : "Draf"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="admin-row-actions">
                  {kind !== "team" && (
                    <button
                      type="button"
                      className="admin-text-button"
                      disabled={busy}
                      onClick={() => void togglePublication(row)}
                    >
                      {row.published ? "Jadikan draf" : "Publikasikan"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${row.title ?? row.name}`}
                    onClick={() => open(row)}
                  >
                    <Edit3 size={17} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button admin-delete-button"
                    aria-label={`Hapus ${row.title ?? row.name}`}
                    onClick={() => setDeleting(row)}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>

    {editing && (
      <AdminDialog
        title={`${editing === "new" ? "Tambah" : "Edit"} ${config.singular}`}
        onClose={closeEditor}
        busy={busy}
      >
        <form onSubmit={save} className="admin-editor">
          {formError && (
            <p role="alert" className="admin-feedback admin-feedback-error">
              {formError}
            </p>
          )}
          <div className="admin-form-grid">
            {kind === "news" && (
              <>
                {input("title", "Judul berita", {
                  required: true,
                  maxLength: 200,
                  autoFocus: true,
                })}
                {input("slug", "Slug / URL", {
                  required: true,
                  identifier: true,
                  hint: `URL publik: /news/${slugPreview}/ · Huruf kecil, angka, dan tanda hubung.`,
                  maxLength: 120,
                })}
                {input("summary", "Ringkasan", {
                  wide: true,
                  type: "textarea",
                  maxLength: 1000,
                  hint: `Ringkasan singkat artikel (${form.summary.length}/1000 karakter).`,
                })}
                {input("content", "Konten artikel", {
                  type: "textarea",
                  wide: true,
                  required: true,
                  hint: "Mendukung Markdown: heading, daftar, tautan, gambar, dan tabel.",
                  maxLength: 100000,
                })}
              </>
            )}
            {kind === "events" && (
              <>
                {input("title", "Nama kegiatan", {
                  required: true,
                  maxLength: 200,
                  autoFocus: true,
                })}
                {input("location", "Lokasi", {
                  maxLength: 300,
                  hint: "Nama ruang, gedung, atau tautan pertemuan daring.",
                })}
                {input("startDate", "Waktu mulai (WIB)", {
                  type: "datetime-local",
                  required: true,
                })}
                {input("endDate", "Waktu selesai (WIB, opsional)", {
                  type: "datetime-local",
                  min: form.startDate || undefined,
                  hint: formatWibInputDuration(form.startDate, form.endDate),
                })}
                {input("description", "Deskripsi kegiatan", {
                  type: "textarea",
                  required: true,
                  wide: true,
                  hint: `Mendukung Markdown (${form.description.length} karakter). Tanggal disimpan dalam UTC dan ditampilkan dalam WIB.`,
                  maxLength: 100000,
                })}
              </>
            )}
            {kind === "team" && (
              <>
                {input("name", "Nama lengkap", {
                  required: true,
                  wide: true,
                  maxLength: 150,
                  autoFocus: true,
                })}
                {input("position", "Jabatan", {
                  required: true,
                  maxLength: 150,
                  hint: "Contoh: Pembina, Ketua Himpunan, atau Kepala Divisi.",
                })}
                {input("order", "Urutan tampilan", {
                  type: "number",
                  hint: "Angka lebih kecil tampil lebih awal (mulai dari 0).",
                })}
                {input("bio", "Bio singkat", {
                  type: "textarea",
                  wide: true,
                  maxLength: 4000,
                  hint: `Peran, fokus, atau profil singkat anggota (${form.bio.length}/4000 karakter).`,
                })}
                <div className="admin-field-stack admin-field-wide">
                  <label className="admin-field">
                    <span>Tautan sosial (JSON)</span>
                    <textarea
                      ref={socialsRef}
                      aria-label="Tautan sosial (JSON)"
                      aria-invalid={showSocialsError ? "true" : "false"}
                      aria-describedby={showSocialsError ? "socials-json-error" : undefined}
                      className="admin-code-input"
                      rows={4}
                      value={form.socials}
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      onChange={(event) => {
                        const value = event.target.value;
                        update("socials", value);
                        const nextStatus = inspectSocialsJson(value);
                        event.currentTarget.setCustomValidity(nextStatus.error);
                        if (socialsInteracted) {
                          syncFieldValidity("socials", event.currentTarget);
                        }
                      }}
                      onBlur={(event) => {
                        setSocialsInteracted(true);
                        event.currentTarget.setCustomValidity(socialsStatus.error);
                        syncFieldValidity("socials", event.currentTarget);
                      }}
                      onInvalid={(event) => {
                        setSocialsInteracted(true);
                        event.currentTarget.setCustomValidity(socialsStatus.error);
                        syncFieldValidity("socials", event.currentTarget);
                      }}
                      maxLength={4000}
                      disabled={busy}
                    />
                    {showSocialsError ? (
                      <small id="socials-json-error" className="admin-field-error">
                        {socialsStatus.error}
                      </small>
                    ) : socialsStatus.entries.length > 0 ? (
                      <small className="admin-field-valid">
                        Terdeteksi {socialsStatus.entries.length} tautan valid:{" "}
                        {socialsStatus.entries.map(([key]) => key).join(", ")}.
                      </small>
                    ) : (
                      <small>
                        Format objek JSON opsional. Contoh: &#123;&quot;instagram&quot;:&quot;https://instagram.com/nama&quot;&#125;
                      </small>
                    )}
                  </label>
                  {(!form.socials.trim() ||
                    (formattedCurrentSocials && form.socials !== formattedCurrentSocials)) && (
                    <div className="admin-json-tools">
                      {!form.socials.trim() ? (
                        <button
                          type="button"
                          className="admin-json-tool"
                          disabled={busy}
                          onClick={() => {
                            update("socials", formattedSocialsExample);
                            setSocialsInteracted(false);
                          }}
                        >
                          Gunakan contoh JSON
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-json-tool"
                          disabled={busy}
                          onClick={() => update("socials", formattedCurrentSocials)}
                        >
                          Rapikan format
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="admin-field admin-field-wide">
              <span>{kind === "team" ? "Foto anggota" : "Gambar konten"}</span>
              <div className={`admin-image-input${uploading ? " is-uploading" : ""}`}>
                <SafeImage
                  src={kind === "team" ? form.photoUrl : form.imageUrl}
                  alt={kind === "team" ? "Pratinjau foto anggota" : "Pratinjau gambar konten"}
                  className={`admin-image-preview ${kind === "team" ? "is-avatar" : ""}`}
                  label="Pratinjau"
                />
                <div>
                  {input(kind === "team" ? "photoUrl" : "imageUrl", "URL gambar", {
                    type: "url",
                    identifier: true,
                    maxLength: 2048,
                  })}
                  <div className="admin-upload-row">
                    <label
                      className={`admin-upload-label${uploading ? " is-uploading" : ""}${busy ? " is-disabled" : ""}`}
                      aria-busy={uploading}
                      aria-disabled={busy || uploading}
                    >
                      {uploading ? (
                        <LoaderCircle className="animate-spin" size={15} aria-hidden="true" />
                      ) : (
                        <Upload size={15} aria-hidden="true" />
                      )}
                      <span>{uploading ? "Mengunggah gambar…" : "Unggah gambar"}</span>
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={busy || uploading}
                        onChange={(event) => {
                          const selected = event.target.files?.[0];
                          event.target.value = "";
                          void upload(selected);
                        }}
                      />
                    </label>
                    {uploading && (
                      <span className="admin-upload-status" role="status" aria-live="polite">
                        Memproses gambar…
                      </span>
                    )}
                  </div>
                  {uploadNotice && !uploading && (
                    <small
                      role={uploadNotice.kind === "error" ? "alert" : "status"}
                      className={`admin-upload-feedback ${uploadNotice.kind === "error" ? "admin-field-error" : "admin-field-valid"}`}
                    >
                      {uploadNotice.message}
                    </small>
                  )}
                  <small>
                    JPEG, PNG, atau WebP, maksimal 5 MB. Unggah memerlukan penyimpanan yang sudah
                    dikonfigurasi.
                  </small>
                </div>
              </div>
            </div>
            {kind !== "team" && (
              <label className="admin-publish-field admin-field-wide">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(event) => update("published", event.target.checked)}
                  disabled={busy}
                />
                <span>
                  <strong>Published</strong>
                  <small>Tampilkan konten di website publik.</small>
                </span>
              </label>
            )}
          </div>
          <div className="admin-form-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={closeEditor}
              disabled={busy}
            >
              Batal
            </button>
            <button type="submit" className="button button-primary" disabled={busy || uploading}>
              {busy ? (
                <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
              ) : (
                <Save size={17} aria-hidden="true" />
              )}
              {busy ? "Menyimpan…" : "Simpan perubahan"}
            </button>
          </div>
        </form>
      </AdminDialog>
    )}

    {deleting && (
      <AdminDialog
        title={`Hapus ${config.singular}?`}
        onClose={() => setDeleting(null)}
        busy={busy}
      >
        <p className="admin-confirm-copy">
          “{deleting.title ?? deleting.name}” akan dihapus. Tindakan ini tidak dapat dibatalkan.
        </p>
        <div className="admin-form-actions">
          <button
            type="button"
            className="button button-secondary"
            autoFocus
            onClick={() => setDeleting(null)}
            disabled={busy}
          >
            Batal
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={() => void remove()}
            disabled={busy}
          >
            {busy ? "Menghapus…" : "Ya, hapus"}
          </button>
        </div>
      </AdminDialog>
    )}
  </>;
}
