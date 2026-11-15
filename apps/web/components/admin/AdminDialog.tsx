"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function AdminDialog({ title, children, onClose, busy = false, className = "", id }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string; id?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pointerDownOnBackdrop = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); previous?.focus(); };
  }, []);
  return <dialog id={id} ref={dialog} className={`admin-dialog ${className}`.trim()} aria-labelledby="admin-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onPointerDown={(event) => { pointerDownOnBackdrop.current = event.target === event.currentTarget; }} onClick={(event) => { if (event.target === event.currentTarget && pointerDownOnBackdrop.current && !busy) onClose(); pointerDownOnBackdrop.current = false; }}>
    <div className="admin-dialog-heading"><h2 id="admin-dialog-title">{title}</h2><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Tutup dialog"><X size={20} aria-hidden="true" /></button></div>
    {children}
  </dialog>;
}
