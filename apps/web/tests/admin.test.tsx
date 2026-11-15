import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { emptyForm, formPayload, fromWibInput, makeSlug, rowToForm, toWibInput } from "../components/admin/content";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000" });
const previousFetch = globalThis.fetch;
Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: dom.window.HTMLElement, configurable: true });
Object.defineProperty(globalThis, "HTMLInputElement", { value: dom.window.HTMLInputElement, configurable: true });
Object.defineProperty(globalThis, "MutationObserver", { value: dom.window.MutationObserver, configurable: true });
Object.defineProperty(dom.window.HTMLDialogElement.prototype, "showModal", { value() { this.setAttribute("open", ""); } });
Object.defineProperty(dom.window.HTMLDialogElement.prototype, "close", { value() { this.removeAttribute("open"); } });
const { render, fireEvent, waitFor, cleanup } = await import("@testing-library/react");
const { LoginForm } = await import("../components/admin/LoginForm");
const { ModelTestPanel } = await import("../components/admin/ModelTestPanel");
const { AiSettingsCard } = await import("../components/admin/AiSettingsCard");
const { ContentManager } = await import("../components/admin/ContentManager");

afterEach(() => { cleanup(); globalThis.fetch = previousFetch; dom.window.localStorage.clear(); });
after(() => dom.window.close());

test("CMS slug generation and WIB conversion preserve the intended instant", () => {
  assert.equal(makeSlug("Kegiatan AET & PCR: Élektronika"), "kegiatan-aet-pcr-elektronika");
  assert.equal(fromWibInput("2026-10-26T09:30"), "2026-10-26T02:30:00.000Z");
  assert.equal(toWibInput("2026-10-26T02:30:00.000Z"), "2026-10-26T09:30");
  assert.throws(() => fromWibInput("2026-02-30T09:30"), /tidak valid/);
  const form = { ...emptyForm(), title: "Seminar", description: "Diskusi komunitas", startDate: "2026-10-26T09:30", endDate: "2026-10-26T08:30" };
  assert.throws(() => formPayload("events", form), /sebelum/);
});

test("CMS payloads exclude unrelated fields and reject unsafe image/social URLs", () => {
  assert.deepEqual(formPayload("news", { ...emptyForm(), title: "Berita AET", content: "Isi artikel" }), { title: "Berita AET", slug: "berita-aet", summary: null, content: "Isi artikel", imageUrl: null, published: false });
  assert.throws(() => formPayload("news", { ...emptyForm(), title: "Judul", imageUrl: "javascript:alert(1)" }), /HTTP/);
  assert.throws(() => formPayload("team", { ...emptyForm(), socials: '{"instagram":"javascript:alert(1)"}' }), /HTTP/);
  const form = rowToForm({ id: "member", name: "Nama", position: "Jabatan", socials: { instagram: "https://instagram.com/aet" }, order: 2 });
  assert.equal(formPayload("team", form).order, 2);
});

test("login submits credentials to backend and opens dashboard only on success", async () => {
  let authenticated = 0;
  let sent: unknown;
  globalThis.fetch = async (input, options) => {
    assert.match(String(input), /\/v1\/auth\/login$/);
    assert.equal(options?.credentials, "include");
    sent = JSON.parse(String(options?.body));
    return Response.json({ user: { id: "admin", username: "operator" } });
  };
  const view = render(<LoginForm onAuthenticated={() => { authenticated += 1; }} />);
  fireEvent.change(view.getByLabelText("Username"), { target: { value: "operator" } });
  fireEvent.change(view.getByLabelText("Password"), { target: { value: "a-long-test-password" } });
  fireEvent.submit(view.getByRole("form", { name: "Masuk administrator" }));
  await waitFor(() => assert.equal(authenticated, 1));
  assert.deepEqual(sent, { username: "operator", password: "a-long-test-password" });
  assert.equal(dom.window.localStorage.length, 0);
});

test("failed login displays the provider-safe error without granting a session", async () => {
  let authenticated = false;
  globalThis.fetch = async () => Response.json({ error: { code: "INVALID_CREDENTIALS", message: "Username atau password salah." } }, { status: 401 });
  const view = render(<LoginForm onAuthenticated={() => { authenticated = true; }} />);
  fireEvent.change(view.getByLabelText("Username"), { target: { value: "operator" } });
  fireEvent.change(view.getByLabelText("Password"), { target: { value: "incorrect" } });
  fireEvent.submit(view.getByRole("form", { name: "Masuk administrator" }));
  await waitFor(() => assert.match(view.getByRole("alert").textContent ?? "", /password salah/));
  assert.equal(authenticated, false);
});

test("manual model panel never sends a request before explicit reload or test and caches reloaded IDs", async () => {
  const requests: { path: string; body: unknown }[] = [];
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    const body = JSON.parse(String(options?.body ?? "{}"));
    requests.push({ path, body });
    if (path.endsWith("/v1/admin/ai/models/reload")) {
      return Response.json({
        models: ["operator/model-1", "gpt-4o-mini"],
        fetchedAt: "2026-11-15T07:00:00.000Z",
        source: "sumopod",
      });
    }
    return Response.json({ response: "Respons model uji", elapsedMs: 350 });
  };
  const view = render(<ModelTestPanel />);
  assert.equal(requests.length, 0);
  fireEvent.click(view.getByRole("button", { name: "Reload model" }));
  await waitFor(() => assert.equal(requests.length, 1));
  assert.match(requests[0].path, /\/v1\/admin\/ai\/models\/reload$/);
  const cachedRaw = dom.window.localStorage.getItem("aet-ai:admin:sumopod-models:v1");
  assert.ok(cachedRaw);
  assert.deepEqual(JSON.parse(cachedRaw).models, ["operator/model-1", "gpt-4o-mini"]);
  fireEvent.click(view.getByRole("button", { name: "Model ID" }));
  fireEvent.change(view.getByLabelText("Cari ID model"), { target: { value: "operator" } });
  assert.equal(view.queryByRole("option", { name: "gpt-4o-mini" }), null);
  fireEvent.click(view.getByRole("option", { name: "operator/model-1" }));
  fireEvent.change(view.getByLabelText("Prompt singkat"), { target: { value: "Jelaskan satu konsep." } });
  assert.equal(requests.length, 1);
  fireEvent.submit(view.getByRole("form", { name: "Uji model AI" }));
  await waitFor(() => assert.match(view.getByText("Respons model uji").textContent ?? "", /Respons model uji/));
  assert.equal(requests.length, 2);
  assert.match(requests[1].path, /\/v1\/admin\/ai\/model-test$/);
  assert.deepEqual(requests[1].body, { modelId: "operator/model-1", prompt: "Jelaskan satu konsep." });
});

test("AET AI settings card loads server configuration and saves updated models and pipeline toggles", async () => {
  let savedPayload: unknown;
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    const method = options?.method ?? "GET";
    if (path.endsWith("/v1/admin/ai/settings") && method === "GET") {
      return Response.json({
        isCustomized: false,
        settings: {
          effortModels: { fast: "gpt-4o-mini", normal: "gpt-4.1-mini", think: "gpt-5-mini" },
          personaModels: { daily: null, report: null, coding: null },
          visionModelId: "gpt-4o-mini",
          classifierModelId: null,
          features: {
            routerV2: false,
            semanticClassifier: false,
            promptPreparation: false,
            multiModelOrchestration: false,
            qualityEvaluation: false,
            visionEnabled: true,
          },
        },
      });
    }
    savedPayload = JSON.parse(String(options?.body ?? "{}"));
    return Response.json({ isCustomized: true, settings: savedPayload });
  };
  const view = render(<AiSettingsCard availableModels={["gpt-4o-mini", "gpt-4.1-mini", "gpt-5-mini", "operator/coding-model"]} hasCachedModels />);
  await waitFor(() => assert.ok(view.getByRole("form", { name: "Form pengaturan model AET AI" })));
  fireEvent.click(view.getByRole("button", { name: "Coding Expert" }));
  fireEvent.click(view.getByRole("option", { name: "operator/coding-model" }));
  fireEvent.click(view.getByRole("switch", { name: "Hybrid Router v2" }));
  fireEvent.click(view.getByRole("button", { name: "Simpan pengaturan" }));
  await waitFor(() => assert.ok(view.getByText(/berhasil disimpan/i)));
  assert.deepEqual(savedPayload, {
    effortModels: { fast: "gpt-4o-mini", normal: "gpt-4.1-mini", think: "gpt-5-mini" },
    personaModels: { daily: null, report: null, coding: "operator/coding-model" },
    visionModelId: "gpt-4o-mini",
    classifierModelId: null,
    features: {
      routerV2: true,
      semanticClassifier: false,
      promptPreparation: false,
      multiModelOrchestration: false,
      qualityEvaluation: false,
      visionEnabled: true,
    },
  });
});

test("CMS news form creates a validated draft and refreshes its collection", async () => {
  let saved: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, options) => {
    if (options?.method === "POST") {
      saved = JSON.parse(String(options.body)) as Record<string, unknown>;
      return Response.json({ id: "new-news", ...saved }, { status: 201 });
    }
    if (options?.method === "PATCH") {
      const patch = JSON.parse(String(options.body)) as Record<string, unknown>;
      saved = { ...saved, ...patch };
      return Response.json({ id: "new-news", ...saved });
    }
    return Response.json(saved ? [{ id: "new-news", ...saved }] : []);
  };
  const view = render(<ContentManager kind="news" />);
  await waitFor(() => assert.ok(view.getByText("Cerita berikutnya dimulai di sini.")));
  assert.equal(view.queryByText(/memerlukan rebuild dan deployment frontend/i), null);
  fireEvent.click(view.getByRole("button", { name: "Tambah berita" }));
  assert.equal(view.queryByText(/Perubahan slug memerlukan rebuild/i), null);
  fireEvent.change(view.getByLabelText("Judul berita"), { target: { value: "Cerita AET" } });
  fireEvent.change(view.getByLabelText("Konten artikel"), { target: { value: "Artikel **Markdown**." } });
  fireEvent.submit(view.getByRole("button", { name: "Simpan perubahan" }).closest("form")!);
  await waitFor(() => assert.ok(view.getByText("Berita berhasil disimpan.")));
  assert.equal(saved?.slug, "cerita-aet");
  assert.equal(saved?.published, false);
  assert.equal(saved?.content, "Artikel **Markdown**.");
  await waitFor(() => assert.ok(view.getByText("Cerita AET")));
  fireEvent.click(view.getByRole("button", { name: "Publikasikan" }));
  await waitFor(() => assert.ok(view.getByText("Konten dipublikasikan.")));
  assert.equal(view.queryByText(/Rute detail baru memerlukan rebuild frontend/i), null);
});
