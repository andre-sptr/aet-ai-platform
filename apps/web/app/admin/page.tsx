"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Newspaper,
  Users,
} from "lucide-react";
import { api } from "../../lib/api";

type AdminNewsItem = {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type AdminEventItem = {
  id: string;
  title: string;
  location: string | null;
  startDate: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type AdminTeamItem = {
  id: string;
  name: string;
  position: string;
  order: number;
  updatedAt: string;
};

type DashboardSnapshot = {
  news: AdminNewsItem[];
  events: AdminEventItem[];
  team: AdminTeamItem[];
  fetchedAt: number;
};

const wibDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function formatWibDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "Tanggal tidak tersedia";
  return `${wibDateFormatter.format(new Date(time))} WIB`;
}

export default function AdminDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<AdminNewsItem[]>("/v1/admin/news"),
      api<AdminEventItem[]>("/v1/admin/events"),
      api<AdminTeamItem[]>("/v1/admin/team"),
    ])
      .then(([news, events, team]) => {
        if (!active) return;
        setSnapshot({ news, events, team, fetchedAt: Date.now() });
        setError("");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Ringkasan belum dapat dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const now = snapshot?.fetchedAt ?? 0;
  const publishedNews = snapshot ? snapshot.news.filter((item) => item.published).length : 0;
  const draftNews = snapshot ? snapshot.news.length - publishedNews : 0;
  const publishedEvents = snapshot ? snapshot.events.filter((item) => item.published).length : 0;
  const upcomingEvents = snapshot
    ? snapshot.events.filter((item) => {
        const start = Date.parse(item.startDate);
        return !Number.isNaN(start) && start >= now;
      }).length
    : 0;

  const summaryCards = [
    {
      key: "news",
      title: "Berita & artikel",
      unit: "artikel",
      icon: Newspaper,
      count: snapshot?.news.length ?? null,
      meta: snapshot
        ? `${publishedNews} terbit, ${draftNews} draf`
        : "Memuat status publikasi artikel",
    },
    {
      key: "events",
      title: "Kegiatan & agenda",
      unit: "kegiatan",
      icon: CalendarDays,
      count: snapshot?.events.length ?? null,
      meta: snapshot
        ? `${publishedEvents} terbit, ${upcomingEvents} akan datang`
        : "Memuat status agenda kegiatan",
    },
    {
      key: "team",
      title: "Struktur tim",
      unit: "anggota",
      icon: Users,
      count: snapshot?.team.length ?? null,
      meta: snapshot
        ? snapshot.team.length > 0
          ? "Susunan pengurus terdaftar"
          : "Belum ada anggota terdaftar"
        : "Memuat data pengurus tim",
    },
  ];

  const recentUpdates = snapshot
    ? [
        ...snapshot.news.map((item) => ({
          id: `news-${item.id}`,
          kind: "Berita" as const,
          href: "/admin/news/",
          title: item.title,
          published: item.published,
          timestamp: Date.parse(item.updatedAt) || Date.parse(item.createdAt) || 0,
          dateLabel: formatWibDate(item.updatedAt || item.createdAt),
        })),
        ...snapshot.events.map((item) => ({
          id: `event-${item.id}`,
          kind: "Kegiatan" as const,
          href: "/admin/events/",
          title: item.title,
          published: item.published,
          timestamp: Date.parse(item.updatedAt) || Date.parse(item.createdAt) || 0,
          dateLabel: formatWibDate(item.updatedAt || item.createdAt),
        })),
      ]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 4)
    : [];

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Ringkasan workspace</p>
          <h1>Selamat datang kembali.</h1>
          <p>Pantau status publikasi berita, agenda kegiatan, dan struktur tim AET PCR.</p>
        </div>
        <div className="admin-page-actions">
          <Link href="/admin/news/" className="button button-primary">
            Tulis berita <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/" className="button button-secondary">
            Lihat website <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {error && (
        <div className="admin-feedback admin-feedback-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError("");
              setRevision((n) => n + 1);
            }}
          >
            Coba lagi
          </button>
        </div>
      )}

      <div className="admin-summary-grid">
        {summaryCards.map(({ key, title, unit, icon: Icon, count, meta }) => (
          <Link href={`/admin/${key}/`} className="admin-summary-card" key={key}>
            <span className="admin-summary-head">
              <span>{title}</span>
              <span className="admin-summary-icon" aria-hidden="true">
                <Icon size={19} />
              </span>
            </span>
            {loading && count === null ? (
              <>
                <span className="admin-skeleton admin-skeleton-count" aria-hidden="true" />
                <span className="admin-sr-only" role="status">
                  Memuat jumlah {title}
                </span>
              </>
            ) : count === null ? (
              <strong className="admin-summary-unavailable" aria-label={`${title}: gagal memuat`}>
                Tidak tersedia
              </strong>
            ) : (
              <strong aria-label={`${title}: ${count} ${unit}`}>{count}</strong>
            )}
            <p className="admin-summary-meta">
              {loading && !snapshot ? (
                <span className="admin-skeleton admin-skeleton-line" aria-hidden="true" />
              ) : error && !snapshot ? (
                "Periksa koneksi API untuk memuat data"
              ) : (
                meta
              )}
            </p>
            <small className="admin-summary-link">
              <span>Kelola {unit}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </small>
          </Link>
        ))}
      </div>

      <div className="admin-dashboard-grid">
        <section
          className="admin-panel"
          aria-labelledby="recent-content-heading"
          aria-busy={loading && !snapshot}
        >
          <div className="admin-panel-header">
            <h2 id="recent-content-heading">Pembaruan konten terakhir</h2>
            <Link href="/admin/news/" className="admin-inline-link">
              Kelola berita <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {loading && !snapshot ? (
            <div className="admin-recent-skeletons">
              <span className="admin-skeleton admin-skeleton-row" aria-hidden="true" />
              <span className="admin-skeleton admin-skeleton-row" aria-hidden="true" />
              <span className="admin-skeleton admin-skeleton-row" aria-hidden="true" />
              <span className="admin-sr-only" role="status">
                Memuat daftar pembaruan konten
              </span>
            </div>
          ) : error && !snapshot ? (
            <div className="admin-empty-state">
              <AlertCircle size={20} aria-hidden="true" />
              <p>Daftar konten belum dapat ditampilkan karena koneksi API gagal.</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setError("");
                  setRevision((n) => n + 1);
                }}
              >
                Muat ulang data
              </button>
            </div>
          ) : recentUpdates.length === 0 ? (
            <div className="admin-empty-state">
              <Newspaper size={20} aria-hidden="true" />
              <p>Belum ada berita atau kegiatan yang disimpan di workspace ini.</p>
              <Link href="/admin/news/" className="button button-secondary">
                Buat berita pertama
              </Link>
            </div>
          ) : (
            <ul className="admin-recent-list">
              {recentUpdates.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="admin-recent-item">
                    <div className="admin-recent-info">
                      <span className="admin-recent-title">{item.title}</span>
                      <span className="admin-recent-meta">
                        <span>{item.kind}</span>
                        <span>Diperbarui {item.dateLabel}</span>
                      </span>
                    </div>
                    <div className="admin-recent-badges">
                      <span
                        className={`admin-state-pill ${item.published ? "is-published" : "is-draft"}`}
                      >
                        {item.published ? (
                          <CheckCircle2 size={14} aria-hidden="true" />
                        ) : (
                          <Clock3 size={14} aria-hidden="true" />
                        )}
                        {item.published ? "Terbit" : "Draf"}
                      </span>
                      <ArrowUpRight size={15} aria-hidden="true" className="admin-recent-arrow" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="admin-dashboard-rail">
          <section className="admin-panel" aria-labelledby="publish-checklist-heading">
            <h2 id="publish-checklist-heading">Sebelum dipublikasikan</h2>
            <ul className="admin-checklist">
              <li>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>Pastikan status Terbit aktif agar konten tampil di website publik.</span>
              </li>
              <li>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>Periksa tanggal kegiatan agar sesuai dengan zona waktu WIB.</span>
              </li>
              <li>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>Atur urutan anggota pada menu Struktur tim sebelum menyimpan.</span>
              </li>
            </ul>
          </section>

          <section className="admin-ai-card" aria-labelledby="ai-card-heading">
            <span className="admin-ai-badge">
              <FlaskConical size={14} aria-hidden="true" />
              Diagnostik model
            </span>
            <h2 id="ai-card-heading">Kenali koneksi model Anda</h2>
            <p>
              Uji satu model secara manual dari akun Sumopod tanpa mengubah pemilihan model adaptif
              pada chat publik.
            </p>
            <Link href="/admin/ai/" className="admin-ai-cta">
              Buka uji model <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
