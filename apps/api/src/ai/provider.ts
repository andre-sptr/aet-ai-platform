import { AiError } from './errors.js';
import { readBoundedBody } from './limits.js';
import { SUMOPOD_ENDPOINT, SUMOPOD_MODELS_ENDPOINT, type ModelSpec } from './models.js';

export type ProviderMessage = { role: 'system' | 'user' | 'assistant'; content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] };
export type ProviderRequest = { model: ModelSpec; messages: ProviderMessage[]; signal: AbortSignal; maxTokens: number; effort: 'fast' | 'normal' | 'think' };
export interface AiProvider {
  stream(request: ProviderRequest): AsyncIterable<string>;
  complete(request: ProviderRequest): Promise<string>;
  listModels?(signal: AbortSignal): Promise<string[]>;
}

/** Incremental SSE decoder: frames may span chunks and use LF or CRLF. */
export async function* readProviderSse(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let completed = false;
  const abort = () => { void reader.cancel(signal.reason); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      pending += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
      if (pending.length > 128_000) throw new AiError('PROVIDER_FRAME', 'Respons penyedia terlalu besar.', 502);
      const frames = pending.replace(/\r\n/g, '\n').split('\n\n');
      pending = frames.pop() ?? '';
      for (const frame of frames) {
        const raw = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!raw) continue;
        if (raw === '[DONE]') { completed = true; return; }
        let value: unknown;
        try { value = JSON.parse(raw); } catch { throw new AiError('PROVIDER_FRAME', 'Format respons penyedia tidak valid.', 502); }
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AiError('PROVIDER_FRAME', 'Format respons penyedia tidak valid.', 502);
        const record = value as { error?: unknown; choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[] };
        if (record.error) throw new AiError('PROVIDER_ERROR', 'Penyedia AI menolak permintaan.', 502);
        const choice = record.choices?.[0];
        if (choice && typeof choice.delta?.content === 'string') yield choice.delta.content;
        if (choice?.finish_reason != null && choice.finish_reason !== 'stop') {
          throw new AiError('INCOMPLETE', 'Jawaban belum selesai atau dibatasi penyedia. Silakan coba lagi.', 502);
        }
        if (choice?.finish_reason === 'stop') completed = true;
      }
      if (part.done) break;
    }
    if (!completed) throw new AiError('INCOMPLETE', 'Koneksi penyedia terputus sebelum jawaban selesai.', 502);
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

const VALID_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

async function assertProviderResponseOk(response: Response, hasApiKey: boolean): Promise<void> {
  if (response.ok) return;
  await response.body?.cancel();
  const status = response.status;
  if (!hasApiKey && (status === 401 || status === 403)) {
    throw new AiError('PROVIDER_UNCONFIGURED', 'Layanan AI belum dikonfigurasi oleh pengelola.', 503);
  }
  throw new AiError(
    status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_REJECTED',
    status === 401 || status === 403
      ? 'Penyedia menolak autentikasi atau akses model. Pengelola perlu memeriksa akun Sumopod.'
      : status === 404
        ? 'Model tidak tersedia pada akun penyedia.'
        : status === 429
          ? 'Batas permintaan penyedia tercapai. Coba lagi nanti.'
          : 'Penyedia AI sedang tidak tersedia.',
    status === 429 ? 429 : 502,
  );
}

function parseProviderModelList(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiError('PROVIDER_FRAME', 'Format respons daftar model penyedia tidak valid.', 502);
  }
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Array.isArray((parsed as { data?: unknown }).data)
        ? (parsed as { data: unknown[] }).data
        : Array.isArray((parsed as { models?: unknown }).models)
          ? (parsed as { models: unknown[] }).models
          : null
      : null;
  if (!items) {
    throw new AiError('PROVIDER_FRAME', 'Format respons daftar model penyedia tidak valid.', 502);
  }
  const ids = new Set<string>();
  for (const item of items) {
    const candidate = typeof item === 'string'
      ? item.trim()
      : item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
        ? (item as { id: string }).id.trim()
        : '';
    if (candidate && candidate.length <= 160 && VALID_MODEL_ID_PATTERN.test(candidate)) {
      ids.add(candidate);
    }
  }
  if (!ids.size) {
    throw new AiError('PROVIDER_EMPTY', 'Daftar model dari akun penyedia kosong.', 502);
  }
  return [...ids].sort((a, b) => a.localeCompare(b, 'en'));
}

export function createSumopodProvider(options: { apiKey?: string; fetcher?: typeof fetch } = {}): AiProvider {
  const fetcher = options.fetcher ?? fetch;
  async function open(request: ProviderRequest, stream: boolean) {
    const key = options.apiKey ?? process.env.SUMOPOD_API_KEY;
    if (!key) throw new AiError('PROVIDER_UNCONFIGURED', 'Layanan AI belum dikonfigurasi oleh pengelola.', 503);
    request.signal.throwIfAborted();
    const payload: Record<string, unknown> = {
      model: request.model.id,
      messages: request.messages,
      stream,
      [request.model.outputTokenField ?? 'max_tokens']: request.maxTokens,
    };
    if (request.model.nativeReasoning === 'reasoning_effort') {
      payload.reasoning_effort = request.effort === 'think' ? 'high' : request.effort === 'fast' ? 'low' : 'medium';
    }
    const response = await fetcher(SUMOPOD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: request.signal,
      redirect: 'error',
    });
    await assertProviderResponseOk(response, true);
    return response;
  }
  return {
    async *stream(request) {
      const response = await open(request, true);
      if (!response.body) throw new AiError('PROVIDER_EMPTY', 'Penyedia tidak mengirimkan jawaban.', 502);
      yield* readProviderSse(response.body, request.signal);
    },
    async complete(request) {
      const response = await open(request, false);
      const raw = await readBoundedBody(response, 256_000, request.signal);
      let parsed: { choices?: { message?: { content?: unknown }; finish_reason?: string }[] };
      try { parsed = JSON.parse(raw); } catch { throw new AiError('PROVIDER_FRAME', 'Format respons penyedia tidak valid.', 502); }
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.choices) || !parsed.choices.length || !parsed.choices[0] || typeof parsed.choices[0] !== 'object') throw new AiError('PROVIDER_FRAME', 'Format respons penyedia tidak valid.', 502);
      const choice = parsed.choices[0];
      if (choice.finish_reason !== 'stop') throw new AiError('INCOMPLETE', 'Jawaban penyedia belum lengkap.', 502);
      const content = choice?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new AiError('PROVIDER_EMPTY', 'Penyedia tidak mengirimkan jawaban.', 502);
      return content;
    },
    async listModels(signal) {
      const key = (options.apiKey ?? process.env.SUMOPOD_API_KEY)?.trim() ?? '';
      signal.throwIfAborted();
      const response = await fetcher(SUMOPOD_MODELS_ENDPOINT, {
        method: 'GET',
        headers: key ? { Authorization: `Bearer ${key}` } : undefined,
        signal,
        redirect: 'error',
      });
      await assertProviderResponseOk(response, Boolean(key));
      const raw = await readBoundedBody(response, 512_000, signal);
      return parseProviderModelList(raw);
    },
  };
}
