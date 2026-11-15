"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Camera, Check, Code2, Copy, FileText, History, LoaderCircle, Menu, MessageCircle, Paperclip, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RotateCcw, Search, Send, Square, ThumbsDown, ThumbsUp, Trash2, UserRound, X } from "lucide-react";
import { api, API_BASE } from "../../lib/api";
import { readChatStream } from "../../lib/chat-stream";
import { prepareImage } from "../../lib/chat-attachments";
import { deleteConversation, emptyStore, loadStore, modelMessages, newConversation, newId, persistStore, retryMessages, updateConversation, type Attachment, type ConversationStore, type Effort, type LocalMessage, type Persona } from "../../lib/conversations";
import { AuroraBackdrop } from "../PublicShell";
import ChatDialog from "./ChatDialog";
import RichContent, { SourceReferences } from "./RichContent";

const personas = {
  daily: {
    modeCode: "01 / SMART COMPANION",
    title: "Smart Companion",
    shortTitle: "Companion",
    subtitle: "Think & explore",
    headingPrefix: "Apa yang ingin kamu ",
    headingAccent: "eksplorasi?",
    icon: MessageCircle,
  },
  report: {
    modeCode: "02 / ACADEMIC WRITER",
    title: "Academic Writer",
    shortTitle: "Academic",
    subtitle: "Research & write",
    headingPrefix: "Tulisan yang kuat dimulai dari ",
    headingAccent: "ide.",
    icon: FileText,
  },
  coding: {
    modeCode: "03 / CODING EXPERT",
    title: "Coding Expert",
    shortTitle: "Coding",
    subtitle: "Build & understand",
    headingPrefix: "Mari bangun sesuatu yang ",
    headingAccent: "bekerja.",
    icon: Code2,
  },
} as const;

const personaOrder = ["daily", "report", "coding"] as const;

const accepted = "image/png,image/jpeg,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Permintaan tidak berhasil. Silakan coba kembali.";

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; }
  } catch { /* Try the accessible fallback for browsers without clipboard permission. */ }
  try {
    const field = document.createElement("textarea");
    field.value = value; field.setAttribute("readonly", "");
    field.style.position = "fixed"; field.style.opacity = "0"; field.style.pointerEvents = "none";
    document.body.appendChild(field); field.select();
    const copied = document.execCommand("copy"); field.remove();
    return copied;
  } catch { return false; }
}

function Message({ message, persona, onEdit, streamingStatus }: { message: LocalMessage; persona: Persona; onEdit?: () => void; streamingStatus?: string }) {
  const AssistantIcon = personas[persona].icon;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [expandedImage, setExpandedImage] = useState<Attachment | null>(null);
  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [copyState]);
  async function copyMessage() { setCopyState(await copyText(message.content) ? "copied" : "failed"); }
  const streaming = message.state === "streaming";
  return <article className={`chat-message chat-message-${message.role}${streaming ? " is-streaming" : ""}`} aria-label={message.role === "user" ? "Pesan Anda" : "Jawaban AET AI"}>
    <div className={`chat-message-avatar ${message.role === "assistant" ? "is-assistant" : "is-user"}`} aria-hidden="true">{message.role === "user" ? <UserRound size={16} /> : <AssistantIcon size={16} />}</div>
    <div className="chat-message-body"><div className="chat-message-author">{message.role === "user" ? "Kamu" : "AET AI"}{streaming && <span className="chat-streaming-badge"><i /> Sedang menjawab</span>}</div>
      {message.attachments?.map(item => <div className="chat-message-attachment" key={item.id}>
        {item.dataUrl && /^data:image\/(png|jpeg|webp);base64,/.test(item.dataUrl) ? <button type="button" className="chat-content-image" aria-label={`Perbesar lampiran ${item.name}`} onClick={() => setExpandedImage(item)}><Image src={item.dataUrl} width={320} height={200} unoptimized alt={item.name} style={{ maxWidth: "100%", height: "auto" }} /></button> : <><FileText size={16} /><span>{item.name}</span>{item.mimeType.startsWith("image/") && <small>Pratinjau tidak disimpan di riwayat</small>}</>}
      </div>)}
      {message.content ? <><RichContent content={message.content} />{streaming && <span className="chat-stream-caret" aria-hidden="true" />}</> : streaming ? <div className="chat-thinking" role="status" aria-label="AET AI sedang menyiapkan jawaban"><span className="chat-thinking-label">{streamingStatus || "Menyiapkan jawaban"}</span><i /><i /><i /></div> : null}
      {message.state === "incomplete" && <p className="chat-incomplete">Jawaban belum selesai. Teks ini tidak digunakan sebagai konteks jawaban berikutnya.</p>}
      {message.sources?.length ? <SourceReferences sources={message.sources} /> : null}
      {!streaming && <div className="chat-message-actions">
        <button type="button" onClick={copyMessage} aria-label={copyState === "copied" ? "Pesan disalin" : "Salin pesan"} title={copyState === "failed" ? "Browser tidak mengizinkan penyalinan" : "Salin pesan"}>{copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}{copyState === "copied" ? "Disalin" : copyState === "failed" ? "Gagal menyalin" : "Salin"}</button>
        {onEdit && <button type="button" onClick={onEdit}><Pencil size={13} /> Edit</button>}
        {message.role === "assistant" && message.state === "complete" && <span className="chat-action-divider" aria-hidden="true" />}
        {message.role === "assistant" && message.state === "complete" && <>
          <button type="button" className={vote === "up" ? "is-selected" : ""} aria-label="Jawaban membantu" aria-pressed={vote === "up"} title="Jawaban membantu" onClick={() => setVote(current => current === "up" ? null : "up")}><ThumbsUp size={13} />{vote === "up" ? "Membantu" : ""}</button>
          <button type="button" className={vote === "down" ? "is-selected" : ""} aria-label="Jawaban kurang membantu" aria-pressed={vote === "down"} title="Jawaban kurang membantu" onClick={() => setVote(current => current === "down" ? null : "down")}><ThumbsDown size={13} />{vote === "down" ? "Kurang membantu" : ""}</button>
          {vote && <span className="chat-vote-note" role="status">Pilihan lokal · belum dikirim</span>}
        </>}
      </div>}
    </div>
    {expandedImage?.dataUrl && <ChatDialog title={expandedImage.name} onClose={() => setExpandedImage(null)}><Image src={expandedImage.dataUrl} width={1400} height={1000} unoptimized alt={expandedImage.name} style={{ width: "100%", height: "auto" }} /></ChatDialog>}
  </article>;
}

export default function ChatWorkspace({ initialPersona, onBack }: { initialPersona: Persona; onBack: () => void }) {
  const [activePersona, setActivePersona] = useState<Persona>(initialPersona);
  const config = personas[activePersona];
  const Icon = config.icon;
  const [store, setStore] = useState<ConversationStore>(() => emptyStore(activePersona));
  const storeRef = useRef(store);
  const saveAllowed = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [effort, setEffort] = useState<Effort>("normal");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewAttachment, setViewAttachment] = useState<Attachment | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const attachMenuId = useId();
  const request = useRef<AbortController | null>(null);
  const uploadRequest = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const attachTriggerRef = useRef<HTMLButtonElement>(null);
  const collapseSidebarRef = useRef<HTMLButtonElement>(null);
  const expandSidebarRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const active = store.conversations.find(item => item.id === store.activeId) || store.conversations[0];
  const isEmptyChat = active.messages.length === 0;
  const latestMessage = active.messages[active.messages.length - 1];
  const latestContentLength = latestMessage?.content.length || 0;

  const commit = useCallback((next: ConversationStore, write = true) => {
    storeRef.current = next; setStore(next);
    if (write && saveAllowed.current) {
      try { persistStore(localStorage, activePersona, next); }
      catch { setStorageError("Riwayat tidak dapat disimpan. Percakapan tetap tersedia selama halaman ini terbuka."); }
    }
  }, [activePersona]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      try { const saved = loadStore(localStorage, activePersona); saveAllowed.current = true; commit(saved, false); }
      catch (failure) { saveAllowed.current = false; setStorageError(errorMessage(failure)); }
      setLoaded(true);
    });
    return () => { mounted = false; request.current?.abort(); uploadRequest.current?.abort(); };
  }, [commit, activePersona]);

  useEffect(() => {
    if (!shouldAutoScroll.current) return;
    const scrollToLatest = () => {
      const viewport = scrollRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    };
    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(scrollToLatest);
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(scrollToLatest, 0);
    return () => window.clearTimeout(timer);
  }, [active.messages.length, latestContentLength, busy, status]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileSidebarOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileSidebarOpen]);

  const isAttachMenuOpen = attachMenuOpen && !busy && !uploading && loaded;
  const syncInputHeight = useCallback(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.overflowY = "hidden";
    element.style.height = "auto";
    const styles = window.getComputedStyle(element);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
    const paddingY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
    const minHeight = Math.ceil(lineHeight + paddingY);
    const maxHeight = Math.ceil(lineHeight * 4 + paddingY);
    const scrollHeight = element.scrollHeight;
    element.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`;
    element.style.overflowY = scrollHeight > maxHeight + 2 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    syncInputHeight();
  }, [input, syncInputHeight]);

  useEffect(() => {
    window.addEventListener("resize", syncInputHeight);
    return () => window.removeEventListener("resize", syncInputHeight);
  }, [syncInputHeight]);

  useEffect(() => {
    if (!isAttachMenuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && attachMenuRef.current?.contains(event.target)) return;
      setAttachMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setAttachMenuOpen(false);
      attachTriggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAttachMenuOpen]);

  function storeMessages(messages: LocalMessage[], conversationId: string, write = true) {
    const current = storeRef.current.conversations.find(item => item.id === conversationId);
    if (!current) return;
    const first = messages.find(item => item.role === "user")?.content.trim();
    commit(updateConversation(storeRef.current, { ...current, messages, title: current.title === "Percakapan baru" && first ? first.slice(0, 65) : current.title, updatedAt: new Date().toISOString() }), write);
  }

  async function generate(history: LocalMessage[]) {
    if (busy || request.current || !history.length) return;
    const lastUser = history.findLast(item => item.role === "user");
    if (!lastUser?.content.trim() && !lastUser?.attachments?.some(item => item.dataUrl || item.text)) { setError("Lampirkan kembali gambar dari perangkat sebelum mengulangi pesan ini."); return; }
    const conversationId = storeRef.current.activeId;
    const controller = new AbortController(); request.current = controller;
    const answer: LocalMessage = { id: newId(), role: "assistant", content: "", state: "streaming" };
    let currentMessages = [...history, answer];
    let complete = false;
    shouldAutoScroll.current = true;
    setBusy(true); setError(""); setStatus("Menghubungkan ke AET AI…");
    storeMessages(currentMessages, conversationId, false);
    try {
      const context = modelMessages(history);
      if (!context.length) throw new Error("Lampiran atau konteks terlalu panjang. Kurangi jumlah dokumen lalu coba kembali.");
      const response = await fetch(`${API_BASE}/v1/chat`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ persona: activePersona, effort, messages: context }), signal: controller.signal });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = payload.error && typeof payload.error === "object" ? payload.error : payload;
        throw new Error(typeof detail.message === "string" ? detail.message : response.status === 429 ? "Terlalu banyak permintaan. Tunggu sebentar sebelum mencoba kembali." : "Layanan AI belum dapat memproses permintaan ini.");
      }
      if (!response.body) throw new Error("Server tidak mengirim aliran jawaban.");
      await readChatStream(response.body, frame => {
        if (request.current !== controller) return;
        if (frame.event === "status") setStatus(frame.data.message);
        if (frame.event === "tool") setStatus(typeof frame.data.message === "string" ? frame.data.message : "Menggunakan alat…");
        if (frame.event === "delta") { answer.content += frame.data.text; if (answer.content.length > 100_000) throw new Error("Jawaban melebihi batas panjang. Coba pertanyaan yang lebih spesifik."); currentMessages = [...history, { ...answer }]; storeMessages(currentMessages, conversationId, false); }
        if (frame.event === "sources") { answer.sources = frame.data.sources; currentMessages = [...history, { ...answer }]; storeMessages(currentMessages, conversationId, false); }
        if (frame.event === "done") complete = true;
      }, controller.signal);
      if (!complete || !answer.content.trim()) { complete = false; throw new Error("Server belum memberikan jawaban yang lengkap. Silakan coba kembali."); }
    } catch (failure) {
      if (request.current === controller) setError(controller.signal.aborted ? "Permintaan dihentikan. Jawaban parsial tidak dipakai sebagai konteks." : errorMessage(failure));
    } finally {
      if (request.current === controller) {
        answer.state = complete && !controller.signal.aborted ? "complete" : "incomplete";
        storeMessages([...history, { ...answer }], conversationId);
        request.current = null; setBusy(false); setStatus("");
        inputRef.current?.focus();
      }
    }
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || request.current || uploading || uploadRequest.current || !loaded || (!input.trim() && !attachments.length)) return;
    const current = storeRef.current.conversations.find(item => item.id === storeRef.current.activeId)!;
    const editIndex = editId ? current.messages.findIndex(item => item.id === editId && item.role === "user") : -1;
    const previous = editIndex >= 0 ? current.messages.slice(0, editIndex) : current.messages;
    const user: LocalMessage = { id: editIndex >= 0 ? editId! : newId(), role: "user", content: input.trim(), state: "complete", ...(attachments.length ? { attachments } : {}) };
    const messages = [...previous, user];
    storeMessages(messages, current.id); setInput(""); setAttachments([]); setEditId(null);
    void generate(messages);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]; event.target.value = "";
    if (!selected || busy || request.current || uploading || uploadRequest.current) return;
    if (attachments.length >= 4) { setError("Maksimal empat lampiran per pesan."); return; }
    if (selected.size > 5 * 1024 * 1024) { setError("Ukuran lampiran maksimal 5 MB."); return; }
    const controller = new AbortController(); uploadRequest.current = controller;
    setUploading(true); setError("");
    try {
      const file = await prepareImage(selected);
      const result = await api<{ attachment: Attachment }>("/v1/attachments/extract", { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name) }, body: file, signal: controller.signal });
      if (uploadRequest.current === controller && !controller.signal.aborted) setAttachments(items => [...items, result.attachment]);
    } catch (failure) { if (!controller.signal.aborted) setError(errorMessage(failure)); }
    finally { if (uploadRequest.current === controller) { uploadRequest.current = null; setUploading(false); } }
  }

  function stopAndLeave() {
    request.current?.abort(); uploadRequest.current?.abort(); onBack();
  }
  const afterFrame = (run: () => void) => {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else window.setTimeout(run, 0);
  };
  function toggleSidebar(collapse: boolean, restoreFocus = false) {
    setSidebarCollapsed(collapse);
    if (!restoreFocus) return;
    afterFrame(() => (collapse ? expandSidebarRef : collapseSidebarRef).current?.focus());
  }
  function openRenameDialog(conversation: { id: string; title: string }) {
    setHistoryOpen(false);
    setRename(conversation.title);
    setRenameId(conversation.id);
  }
  function submitRename(event: FormEvent) {
    event.preventDefault();
    const title = rename.trim().slice(0, 100);
    if (!title || !renameId) return;
    const target = storeRef.current.conversations.find(item => item.id === renameId);
    if (target) {
      if (target.id === storeRef.current.activeId) {
        commit(updateConversation(storeRef.current, { ...target, title }));
      } else {
        commit({
          ...storeRef.current,
          conversations: storeRef.current.conversations.map(item => item.id === target.id ? { ...item, title } : item),
        });
      }
    }
    setRenameId(null);
  }
  function createConversation() {
    if (busy) return;
    const item = newConversation(activePersona);
    commit(updateConversation(storeRef.current, item)); setInput(""); setAttachments([]); setError(""); setEditId(null); setHistoryOpen(false); setMobileSidebarOpen(false); inputRef.current?.focus();
  }
  function switchPersona(nextPersona: Persona) {
    if (busy || nextPersona === activePersona) return;
    request.current?.abort(); uploadRequest.current?.abort();
    const fresh = emptyStore(nextPersona);
    storeRef.current = fresh; setStore(fresh);
    setActivePersona(nextPersona);
    setInput(""); setAttachments([]); setError(""); setEditId(null); setHistoryOpen(false); setMobileSidebarOpen(false);
    inputRef.current?.focus();
  }
  function editMessage(message: LocalMessage) {
    setEditId(message.id); setInput(message.content); setAttachments(message.attachments?.filter(item => item.text || item.dataUrl) || []); inputRef.current?.focus();
  }

  const history = store.conversations.filter(item => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const dayKey = (value: string | Date) => { const date = typeof value === "string" ? new Date(value) : value; return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; };
  const historyGroups = [
    { label: "Hari ini", items: history.filter(item => dayKey(item.updatedAt) === dayKey(today)) },
    { label: "Kemarin", items: history.filter(item => dayKey(item.updatedAt) === dayKey(yesterday)) },
    { label: "Sebelumnya", items: history.filter(item => dayKey(item.updatedAt) !== dayKey(today) && dayKey(item.updatedAt) !== dayKey(yesterday)) },
  ].filter(group => group.items.length);
  const selectConversation = (id: string) => {
    commit({ ...storeRef.current, activeId: id }); setError(""); setEditId(null); setInput(""); setAttachments([]); setMobileSidebarOpen(false);
  };
  return <div className={`chat-workspace persona-${activePersona} ui-editorial sb-modular sbg-mist ${isEmptyChat ? "is-empty-chat" : "is-active-chat"}${sidebarCollapsed ? " sidebar-collapsed" : ""}${mobileSidebarOpen ? " mobile-sidebar-open" : ""}`}>
    <a href="#chat-main" className="chat-skip">Lewati ke percakapan</a>
    {mobileSidebarOpen && <button type="button" className="chat-mobile-scrim" aria-label="Tutup navigasi" onClick={() => setMobileSidebarOpen(false)} />}
    <aside className={`chat-sidebar${mobileSidebarOpen ? " is-mobile-open" : ""}`} aria-label="Navigasi percakapan" {...(mobileSidebarOpen ? { role: "dialog", "aria-modal": true } : {})}>
      <div className="chat-sidebar-brand-row">
        <button type="button" className="chat-brand" onClick={stopAndLeave} aria-label="AET AI — kembali ke beranda">
          <span className="chat-brand-word">AET <span>AI</span><i aria-hidden="true" /></span>
          <small>YOUR THINKING PARTNER</small>
        </button>
        <button ref={collapseSidebarRef} type="button" className="chat-icon chat-sidebar-collapse" aria-label="Ciutkan sidebar" title="Ciutkan sidebar" aria-expanded={!sidebarCollapsed} onClick={event => toggleSidebar(true, event.detail === 0)}><PanelLeftClose size={18} /></button>
        <button type="button" className="chat-icon chat-sidebar-mobile-close" aria-label="Tutup navigasi" onClick={() => setMobileSidebarOpen(false)}><X size={18} /></button>
      </div>
      <button type="button" className="chat-new" onClick={createConversation} disabled={busy || !loaded}>
        <span className="chat-new-icon" aria-hidden="true"><Plus size={16} strokeWidth={2.2} /></span>
        <span>Percakapan baru</span>
      </button>
      <div className="chat-sidebar-label">MODE WORKSPACE</div>
      <div className="chat-mode-switcher" role="group" aria-label="Ganti mode AI">
        {personaOrder.map(key => {
          const item = personas[key];
          const ModeIcon = item.icon;
          const isCurrent = activePersona === key;
          return (
            <button
              type="button"
              key={key}
              className={`chat-persona-option mode-${key}${isCurrent ? " is-active" : ""}`}
              aria-label={`Pilih mode ${item.title}`}
              aria-pressed={isCurrent}
              disabled={busy}
              onClick={() => switchPersona(key)}
              title={`${item.title} — ${item.subtitle}`}
            >
              <span className="chat-persona-icon" aria-hidden="true"><ModeIcon size={16} /></span>
              <span className="chat-persona-copy">
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
                <span className="chat-persona-short" aria-hidden="true">{item.shortTitle}</span>
              </span>
              <span className="chat-persona-dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="chat-sidebar-label chat-history-label">RIWAYAT PERCAKAPAN</div>
      <label className="chat-history-search-wrap"><Search size={15} /><input aria-label="Cari riwayat percakapan" className="chat-history-search" placeholder="Cari percakapan…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="chat-sidebar-history">{historyGroups.length ? historyGroups.map(group => <section className="chat-history-group" key={group.label}><h2>{group.label}</h2>{group.items.map(item => <button type="button" key={item.id} disabled={busy} aria-current={item.id === active.id ? "true" : undefined} onClick={() => selectConversation(item.id)} title={item.title}><span className="chat-history-dot" />{item.title}</button>)}</section>) : <p className="chat-history-empty">{search ? "Tidak ada percakapan yang cocok." : "Percakapan baru akan muncul di sini."}</p>}</div>
      <div className="chat-sidebar-footer"><nav aria-label="Tautan AET"><Link href="/">Beranda</Link><Link href="/news/">Berita</Link><Link href="/events/">Kegiatan</Link></nav><p><span className="chat-local-indicator" /> Riwayat tersimpan lokal di perangkat ini.</p></div>
      {sidebarCollapsed && !mobileSidebarOpen && (
        <button
          ref={expandSidebarRef}
          type="button"
          className="chat-sidebar-expand"
          aria-label="Perluas sidebar"
          title="Perluas sidebar"
          aria-expanded={false}
          onClick={event => toggleSidebar(false, event.detail === 0)}
        >
          <span className="chat-sidebar-expand-icon" aria-hidden="true"><PanelLeftOpen size={18} /></span>
        </button>
      )}
    </aside>
    <main id="chat-main" className="chat-main">
      <AuroraBackdrop />
      <header className="chat-topbar">
        <div className="chat-topbar-title">
          <button type="button" className="chat-icon chat-mobile-menu" aria-label="Buka navigasi" onClick={() => setMobileSidebarOpen(true)}><Menu size={19} /></button>
          <button type="button" className="chat-icon chat-back-home" aria-label="Kembali ke beranda" onClick={stopAndLeave}><ArrowLeft size={19} /></button>
          <span className="chat-persona-mark"><Icon size={17} /></span>
          <div>
            <h1>{config.title}</h1>
            <p><span className="chat-topbar-dot" /> AET AI <span className="chat-topbar-separator">·</span> Adaptif untuk kebutuhanmu</p>
          </div>
        </div>
        <div className="chat-topbar-actions">
          <button type="button" className="chat-icon" aria-label="Buka riwayat" onClick={() => setHistoryOpen(true)} disabled={!loaded}><History size={18} /></button>
          <button type="button" className="chat-icon" aria-label="Ganti nama percakapan" onClick={() => openRenameDialog(active)} disabled={busy || !loaded}><Pencil size={16} /></button>
          <button type="button" className="chat-icon chat-danger" aria-label="Hapus percakapan" onClick={() => setDeleteId(active.id)} disabled={busy || !loaded}><Trash2 size={17} /></button>
        </div>
      </header>
      <div ref={scrollRef} className="chat-scroll" aria-label="Percakapan" onScroll={event => { const element = event.currentTarget; shouldAutoScroll.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120; }}><div className="chat-reading">
        {isEmptyChat && (
          <section className="chat-start">
            <div className="chat-start-head">
              <div className="chat-eyebrow-pill"><span className="chat-eyebrow-dot" aria-hidden="true" />{config.modeCode}</div>
            </div>
            <h2>{config.headingPrefix}<em>{config.headingAccent}</em></h2>
          </section>
        )}
        {active.messages.map(message => <Message key={message.id} message={message} persona={activePersona} streamingStatus={message.state === "streaming" ? status : undefined} onEdit={message.role === "user" && !busy ? () => editMessage(message) : undefined} />)}
      </div></div>
      <div className="chat-composer-area"><div className="chat-composer-inner">
        {error && <div className="chat-feedback chat-feedback-error" role="alert">{error}{active.messages.some(message => message.role === "user") && <button type="button" onClick={() => void generate(retryMessages(active.messages))} disabled={busy}><RotateCcw size={13} /> Coba ulang</button>}</div>}
        {storageError && <p className="chat-feedback chat-feedback-error" role="alert">{storageError}</p>}
        {editId && <div className="chat-feedback">Mengedit pesan. Jawaban setelah pesan ini akan diganti.<button type="button" onClick={() => { setEditId(null); setInput(""); setAttachments([]); }}>Batal edit</button></div>}
        {attachments.length > 0 && <div className="chat-pending-attachments">{attachments.map(item => <div key={item.id}><button type="button" className="chat-attachment-name" onClick={() => item.dataUrl ? setViewAttachment(item) : undefined}>{item.dataUrl ? <Image src={item.dataUrl} alt="" width={38} height={38} unoptimized /> : <FileText size={20} />}<span>{item.name}</span></button><button type="button" className="chat-icon" aria-label={`Hapus lampiran ${item.name}`} onClick={() => setAttachments(items => items.filter(attachment => attachment.id !== item.id))}><X size={15} /></button></div>)}</div>}
        <form onSubmit={submit} className="chat-composer">
          <div className="chat-composer-tools"><div
            ref={attachMenuRef}
            className="chat-attach-wrap"
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAttachMenuOpen(false); }}
          >
            <button
              ref={attachTriggerRef}
              type="button"
              className={`chat-icon chat-attach-trigger${isAttachMenuOpen ? " is-open" : ""}`}
              aria-label="Tambah lampiran"
              title="Tambah lampiran"
              aria-haspopup="menu"
              aria-expanded={isAttachMenuOpen}
              aria-controls={isAttachMenuOpen ? attachMenuId : undefined}
              disabled={busy || uploading || !loaded}
              onClick={() => setAttachMenuOpen(open => !open)}
              onKeyDown={event => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                setAttachMenuOpen(true);
                afterFrame(() => attachMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
              }}
            >
              {uploading ? <LoaderCircle size={18} className="chat-spin" /> : <Plus size={18} strokeWidth={2.2} />}
            </button>
            {isAttachMenuOpen && (
              <div
                id={attachMenuId}
                className="chat-attach-dropdown"
                role="menu"
                aria-label="Opsi lampiran"
                onKeyDown={event => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
                  if (!items.length) return;
                  event.preventDefault();
                  const index = items.indexOf(document.activeElement as HTMLButtonElement);
                  const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
                  items[next].focus();
                }}
              >
                <button type="button" role="menuitem" className="chat-attach-option" onClick={() => { setAttachMenuOpen(false); fileRef.current?.click(); }}>
                  <Paperclip size={16} aria-hidden="true" />
                  <span>Tambah file</span>
                </button>
                <button type="button" role="menuitem" className="chat-attach-option" onClick={() => { setAttachMenuOpen(false); cameraRef.current?.click(); }}>
                  <Camera size={16} aria-hidden="true" />
                  <span>Tambah foto</span>
                </button>
              </div>
            )}
          </div></div>
          <label htmlFor="aet-chat-input" className="sr-only">Pesan untuk {config.title}</label>
          <textarea id="aet-chat-input" ref={inputRef} placeholder="Minta AET AI…" value={input} maxLength={20_000} rows={1} disabled={busy || !loaded} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
          <div className="chat-composer-controls"><fieldset className="chat-effort" disabled={busy}><legend className="sr-only">Mode respons</legend>{([['fast', 'Fast', 'Cepat'], ['normal', 'Normal', 'Seimbang'], ['think', 'Think', 'Analisis mendalam']] as const).map(([value, label, description]) => <label key={value} className={effort === value ? "selected" : ""} title={description}><input type="radio" name="chat-effort" value={value} checked={effort === value} onChange={() => setEffort(value)} /><span>{label}</span></label>)}</fieldset><button type={busy ? "button" : "submit"} className={`chat-send${busy ? " is-stop" : ""}`} aria-label={busy ? "Hentikan jawaban" : "Kirim pesan"} title={busy ? "Hentikan jawaban" : "Kirim pesan"} disabled={!busy && (uploading || !loaded || !input.trim() && !attachments.length)} onClick={busy ? () => request.current?.abort() : undefined}>{busy ? <Square size={14} fill="currentColor" /> : <Send size={17} />}</button></div>
        </form>
        <input ref={fileRef} type="file" accept={accepted} onChange={selectFile} hidden aria-label="Pilih lampiran" /><input ref={cameraRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={selectFile} hidden aria-label="Pilih foto kamera" />
        {uploading && <p role="status" className="chat-progress">Memvalidasi dan membaca lampiran…</p>}{busy && <p role="status" aria-live="polite" className="chat-progress">{status}</p>}
        <p className="chat-disclaimer">AI dapat melakukan kesalahan. Periksa kembali informasi penting.</p>
      </div></div>
    </main>
    {historyOpen && <ChatDialog title="Percakapan tersimpan" onClose={() => setHistoryOpen(false)}><p className="chat-dialog-note">Riwayat per mode tersimpan di browser ini.</p><button type="button" className="chat-new" disabled={busy} onClick={createConversation}><Plus size={16} /> Percakapan baru</button><input className="chat-history-search" aria-label="Cari percakapan tersimpan" placeholder="Cari percakapan…" value={search} onChange={event => setSearch(event.target.value)} /><div className="chat-dialog-history">{history.map(item => <div key={item.id}><button type="button" disabled={busy} aria-current={item.id === active.id ? "true" : undefined} onClick={() => { selectConversation(item.id); setHistoryOpen(false); }}>{item.title}</button><button type="button" className="chat-icon" disabled={busy} aria-label={`Ganti nama ${item.title}`} onClick={() => openRenameDialog(item)}><Pencil size={16} /></button><button type="button" className="chat-icon chat-danger" disabled={busy} aria-label={`Hapus ${item.title}`} onClick={() => { setHistoryOpen(false); setDeleteId(item.id); }}><Trash2 size={16} /></button></div>)}</div></ChatDialog>}
    {renameId && <ChatDialog title="Ganti nama percakapan" onClose={() => setRenameId(null)}><form onSubmit={submitRename}><label className="chat-field">Nama percakapan<input value={rename} maxLength={100} required onChange={event => setRename(event.target.value)} /></label><div className="chat-dialog-actions"><button type="button" onClick={() => setRenameId(null)}>Batal</button><button type="submit" className="chat-primary">Simpan nama</button></div></form></ChatDialog>}
    {deleteId && <ChatDialog title="Hapus percakapan ini?" onClose={() => setDeleteId(null)}><p>Percakapan <strong>{store.conversations.find(item => item.id === deleteId)?.title}</strong> akan dihapus dari browser ini. Tindakan ini tidak dapat dibatalkan.</p><div className="chat-dialog-actions"><button type="button" onClick={() => setDeleteId(null)}>Batal</button><button type="button" className="chat-delete" onClick={() => { commit(deleteConversation(storeRef.current, deleteId, activePersona)); setDeleteId(null); setError(""); setInput(""); setAttachments([]); setEditId(null); }}>Hapus percakapan</button></div></ChatDialog>}
    {viewAttachment?.dataUrl && <ChatDialog title={viewAttachment.name} onClose={() => setViewAttachment(null)}><Image src={viewAttachment.dataUrl} width={1400} height={1000} unoptimized alt={viewAttachment.name} style={{ width: "100%", height: "auto" }} /></ChatDialog>}
  </div>;
}
