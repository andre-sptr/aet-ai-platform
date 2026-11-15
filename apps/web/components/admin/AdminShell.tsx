"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, CalendarDays, FlaskConical, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Menu, Newspaper, Users } from "lucide-react";
import { api } from "../../lib/api";
import { AdminDialog } from "./AdminDialog";
import "./admin.css";

const navGroups = [
  {
    label: "Konten",
    links: [
      { href: "/admin/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/news/", label: "Berita", icon: Newspaper },
      { href: "/admin/events/", label: "Kegiatan", icon: CalendarDays },
      { href: "/admin/team/", label: "Struktur tim", icon: Users },
    ],
  },
  {
    label: "Sistem",
    links: [{ href: "/admin/ai/", label: "Uji model AI", icon: FlaskConical }],
  },
];

function isRouteActive(pathname: string, href: string) {
  return href === "/admin/"
    ? pathname.replace(/\/$/, "") === "/admin"
    : pathname.startsWith(href.replace(/\/$/, ""));
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ user: { id: string; username: string } }>("/v1/auth/me").then((data) => { if (active) setUser(data.user); }).catch((caught: unknown) => {
      if (!active) return;
      const status = caught && typeof caught === "object" && "status" in caught ? caught.status : undefined;
      if (status === 401) router.replace("/login/");
      else setError(caught instanceof Error ? caught.message : "Sesi tidak dapat diperiksa. Periksa koneksi API.");
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [router, revision]);
  async function logout() {
    setLeaving(true); setError("");
    try { await api("/v1/auth/logout", { method: "POST", body: "{}" }); setUser(null); router.replace("/login/"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Gagal keluar. Coba lagi."); setLeaving(false); }
  }
  const allLinks = navGroups.flatMap((group) => group.links);
  const activeRoute = allLinks.find((item) => isRouteActive(pathname, item.href)) ?? allLinks[0];
  const ActiveIcon = activeRoute.icon;
  const navigation = (
    <>
      <nav className="admin-navigation" aria-label="Navigasi administrator">
        {navGroups.map((group) => (
          <div key={group.label} className="admin-nav-group">
            <p className="admin-rail-label">{group.label}</p>
            <div className="admin-nav-list">
              {group.links.map(({ href, label, icon: Icon }) => {
                const active = isRouteActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenu(false)}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="admin-rail-actions">
        <Link href="/" onClick={() => setMenu(false)}>
          <ArrowUpRight size={17} aria-hidden="true" />
          <span>Lihat website</span>
        </Link>
        <button type="button" className="admin-logout-button" disabled={leaving} onClick={logout}>
          <LogOut size={17} aria-hidden="true" />
          <span>{leaving ? "Keluar..." : "Keluar dari admin"}</span>
        </button>
      </div>
    </>
  );
  if (checking) {
    return (
      <main id="main-content" className="admin-session-state" role="status">
        <div className="admin-session-card">
          <div className="admin-session-brand">
            <span className="admin-wordmark">
              aet<span>ai.</span>
              <small>CONTENT WORKSPACE</small>
            </span>
          </div>
          <div className="admin-session-spinner" aria-hidden="true">
            <LoaderCircle size={24} className="animate-spin" />
          </div>
          <p className="admin-session-title">Memeriksa sesi administrator…</p>
          <p className="admin-session-subtitle">Menghubungkan ke layanan autentikasi workspace.</p>
        </div>
      </main>
    );
  }
  if (!user) {
    return (
      <main id="main-content" className="admin-session-state">
        <div className="admin-session-card">
          <div className="admin-session-brand">
            <span className="admin-wordmark">
              aet<span>ai.</span>
              <small>CONTENT WORKSPACE</small>
            </span>
          </div>
          <div className="admin-session-icon" aria-hidden="true">
            <LockKeyhole size={22} />
          </div>
          <h1>Masuk ke workspace</h1>
          {error ? (
            <p className="admin-feedback admin-feedback-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="admin-session-subtitle">Anda memerlukan sesi administrator untuk membuka halaman ini.</p>
          )}
          <div className="admin-session-actions">
            {error && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setChecking(true);
                  setError("");
                  setRevision((n) => n + 1);
                }}
              >
                Coba lagi
              </button>
            )}
            <Link href="/login/" className="button button-primary">
              Ke halaman masuk
            </Link>
          </div>
        </div>
      </main>
    );
  }
  return <div className="aet-admin"><a className="skip-link" href="#main-content">Lewati navigasi admin</a><aside className="admin-rail"><Link href="/admin/" className="admin-wordmark">aet<span>ai.</span><small>CONTENT WORKSPACE</small></Link>{navigation}</aside>
    <div className="admin-mobile-header"><Link className="admin-wordmark" href="/admin/">aet<span>ai.</span></Link><button type="button" className="icon-button" aria-label="Buka menu admin" aria-expanded={menu} aria-controls={menu ? "admin-mobile-nav" : undefined} onClick={() => setMenu(true)}><Menu size={22} aria-hidden="true" /></button></div>
    {menu && <AdminDialog id="admin-mobile-nav" className="admin-nav-dialog" title="AET Admin" onClose={() => setMenu(false)}>{navigation}</AdminDialog>}
    <div className="admin-body"><header className="admin-topbar"><div className="admin-topbar-route"><ActiveIcon size={15} aria-hidden="true" /><span>AET Admin</span><span aria-hidden="true">/</span><strong>{activeRoute.label}</strong></div><div className="admin-topbar-user"><span className="admin-topbar-role">Administrator</span><span className="admin-topbar-name">{user.username}</span><span className="admin-avatar" aria-hidden="true">{user.username.slice(0, 2).toUpperCase()}</span></div></header><main id="main-content" className="admin-content">{error && <p role="alert" className="admin-feedback admin-feedback-error">{error}</p>}{children}</main></div>
  </div>;
}
