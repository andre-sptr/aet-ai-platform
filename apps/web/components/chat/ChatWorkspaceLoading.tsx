"use client";

import { ArrowLeft, Code2, FileText, LoaderCircle, MessageCircle } from "lucide-react";
import type { Persona } from "../../lib/conversations";
import { AuroraBackdrop } from "../PublicShell";

const personaMeta = {
  daily: {
    modeCode: "01 / SMART COMPANION",
    title: "Smart Companion",
    shortTitle: "Companion",
    icon: MessageCircle,
  },
  report: {
    modeCode: "02 / ACADEMIC WRITER",
    title: "Academic Writer",
    shortTitle: "Academic",
    icon: FileText,
  },
  coding: {
    modeCode: "03 / CODING EXPERT",
    title: "Coding Expert",
    shortTitle: "Coding",
    icon: Code2,
  },
} as const;

const personaOrder: readonly Persona[] = ["daily", "report", "coding"];

/** Skeleton shell matching ChatWorkspace geometry and Soft Aurora Mist palette during lazy load. */
export default function ChatWorkspaceLoading({ persona = "coding" }: { persona?: Persona }) {
  const active = personaMeta[persona];
  const ActiveIcon = active.icon;

  return (
    <div
      className={`chat-workspace persona-${persona} ui-editorial sb-modular sbg-mist is-empty-chat chat-loading-shell`}
      aria-busy="true"
    >
      <aside className="chat-sidebar" aria-hidden="true">
        <div className="chat-sidebar-brand-row">
          <div className="chat-brand">
            <span className="chat-brand-word">
              AET <span>AI</span>
              <i />
            </span>
            <small>YOUR THINKING PARTNER</small>
          </div>
          <span className="chat-skeleton chat-skeleton-icon" />
        </div>

        <div className="chat-skeleton chat-skeleton-new" />

        <div className="chat-sidebar-label">MODE WORKSPACE</div>
        <div className="chat-mode-switcher">
          {personaOrder.map((key) => {
            const item = personaMeta[key];
            const ModeIcon = item.icon;
            const isCurrent = key === persona;
            return (
              <div key={key} className={`chat-persona-option mode-${key}${isCurrent ? " is-active" : ""}`}>
                <span className="chat-persona-icon">
                  <ModeIcon size={16} />
                </span>
                <span className="chat-persona-copy">
                  <span className="chat-persona-short">{item.shortTitle}</span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="chat-sidebar-label chat-history-label">RIWAYAT PERCAKAPAN</div>
        <div className="chat-skeleton chat-skeleton-search" />

        <div className="chat-sidebar-history">
          <div className="chat-skeleton chat-skeleton-row is-wide" />
          <div className="chat-skeleton chat-skeleton-row is-mid" />
          <div className="chat-skeleton chat-skeleton-row is-short" />
        </div>

        <div className="chat-sidebar-footer">
          <div className="chat-loading-footer-pills">
            <span className="chat-skeleton chat-skeleton-pill" />
            <span className="chat-skeleton chat-skeleton-pill" />
            <span className="chat-skeleton chat-skeleton-pill" />
          </div>
          <div className="chat-skeleton chat-skeleton-caption" />
        </div>
      </aside>

      <main id="main-content" className="chat-main">
        <AuroraBackdrop />

        <header className="chat-topbar">
          <div className="chat-topbar-title">
            <span className="chat-icon chat-back-home" aria-hidden="true">
              <ArrowLeft size={19} />
            </span>
            <span className="chat-persona-mark" aria-hidden="true">
              <ActiveIcon size={17} />
            </span>
            <div>
              <h1>{active.title}</h1>
              <p>
                <span className="chat-topbar-dot" /> AET AI{" "}
                <span className="chat-topbar-separator">·</span> Menyiapkan workspace
              </p>
            </div>
          </div>
          <div className="chat-topbar-actions chat-loading-actions" aria-hidden="true">
            <span className="chat-skeleton chat-skeleton-action" />
            <span className="chat-skeleton chat-skeleton-action" />
            <span className="chat-skeleton chat-skeleton-action" />
            <span className="chat-skeleton chat-skeleton-action" />
          </div>
        </header>

        <div className="chat-scroll">
          <div className="chat-reading">
            <section className="chat-start chat-loading-start">
              <div className="chat-start-head">
                <div className="chat-eyebrow-pill">
                  <span className="chat-eyebrow-dot" aria-hidden="true" />
                  {active.modeCode}
                </div>
              </div>

              <div className="chat-loading-heading" aria-hidden="true">
                <span className="chat-skeleton chat-skeleton-title" />
                <span className="chat-skeleton chat-skeleton-title is-accent" />
              </div>

              <div className="chat-loading-status" role="status" aria-live="polite">
                <LoaderCircle size={14} className="chat-spin" aria-hidden="true" />
                <span>Membuka ruang percakapan…</span>
              </div>
            </section>
          </div>
        </div>

        <div className="chat-composer-area" aria-hidden="true">
          <div className="chat-composer-inner">
            <div className="chat-composer chat-loading-composer">
              <div className="chat-loading-composer-input">
                <span className="chat-skeleton chat-skeleton-line" />
                <span className="chat-skeleton chat-skeleton-line is-short" />
              </div>
              <div className="chat-composer-toolbar">
                <div className="chat-loading-composer-tools">
                  <span className="chat-skeleton chat-skeleton-action" />
                  <span className="chat-skeleton chat-skeleton-action" />
                </div>
                <div className="chat-loading-composer-controls">
                  <span className="chat-skeleton chat-skeleton-effort" />
                  <span className="chat-skeleton chat-skeleton-send" />
                </div>
              </div>
            </div>
            <p className="chat-disclaimer">AI dapat melakukan kesalahan. Periksa kembali informasi penting.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
