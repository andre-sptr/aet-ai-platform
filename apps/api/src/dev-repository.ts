import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventSchema, NewsSchema, TeamMemberSchema, type Event as AetEvent, type News, type TeamMember } from '@aet/contracts';
import type { AdminIdentity } from './auth.js';
import type { AdminRecord, ContentInput, ContentRecord, Repository, Resource } from './repository.js';

function resolveSeedPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'data/legacy-content.json'),
    path.resolve(process.cwd(), '../../data/legacy-content.json'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data/legacy-content.json'),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

function loadSeedRecords(records: Record<Resource, Map<string, ContentRecord>>, seedPath: string | null): void {
  if (!seedPath) return;
  try {
    const raw = JSON.parse(readFileSync(seedPath, 'utf8')) as Record<string, unknown>;
    const loaders: Array<{ resource: Resource; parse: (value: unknown) => { success: boolean; data?: ContentRecord } }> = [
      { resource: 'news', parse: value => NewsSchema.safeParse(value) },
      { resource: 'events', parse: value => EventSchema.safeParse(value) },
      { resource: 'team', parse: value => TeamMemberSchema.safeParse(value) },
    ];
    for (const { resource, parse } of loaders) {
      const entries = raw[resource];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const parsed = parse(entry);
        if (parsed.success && parsed.data) records[resource].set(parsed.data.id, parsed.data);
      }
    }
  } catch {
    // Missing or malformed seed files fall back to an empty in-memory store in dev.
  }
}

/** Development-only in-memory repository seeded from legacy-content.json when PostgreSQL is offline. */
export function createDevFallbackRepository(seedPath = resolveSeedPath()): Repository {
  const admins = new Map<string, AdminRecord>();
  const sessions = new Map<string, { adminId: string; expiresAt: Date }>();
  const records: Record<Resource, Map<string, ContentRecord>> = {
    news: new Map(),
    events: new Map(),
    team: new Map(),
  };
  loadSeedRecords(records, seedPath);

  const list = async (resource: Resource, includeUnpublished = false): Promise<ContentRecord[]> => {
    const items = [...records[resource].values()].filter(
      item => resource === 'team' || includeUnpublished || ('published' in item && item.published),
    );
    if (resource === 'news') {
      return (items as News[]).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    if (resource === 'events') {
      return (items as AetEvent[]).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
    }
    return (items as TeamMember[]).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  };

  return {
    async ping() {},
    async findAdmin(username: string) {
      return admins.get(username) ?? null;
    },
    async createAdmin(username: string, passwordHash: string) {
      const admin = { id: randomUUID(), username, passwordHash };
      admins.set(username, admin);
      return { id: admin.id, username };
    },
    async createSession(digest: string, adminId: string, expiresAt: Date) {
      sessions.set(digest, { adminId, expiresAt });
    },
    async findSession(digest: string, now: Date): Promise<AdminIdentity | null> {
      const session = sessions.get(digest);
      if (!session || session.expiresAt <= now) return null;
      const admin = [...admins.values()].find(item => item.id === session.adminId);
      return admin ? { id: admin.id, username: admin.username } : null;
    },
    async deleteSession(digest: string) {
      sessions.delete(digest);
    },
    list,
    async find(resource: Resource, key: string, includeUnpublished = false) {
      return (await list(resource, includeUnpublished)).find(
        item => (resource === 'news' && !includeUnpublished ? 'slug' in item && item.slug === key : item.id === key),
      ) ?? null;
    },
    async create(resource: Resource, input: ContentInput) {
      if (resource === 'news' && [...records.news.values()].some(item => 'slug' in item && item.slug === input.slug)) {
        throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      }
      const timestamp = new Date().toISOString();
      const record = { ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp } as ContentRecord;
      records[resource].set(record.id, record);
      return record;
    },
    async update(resource: Resource, id: string, input: ContentInput) {
      const existing = records[resource].get(id);
      if (!existing) throw Object.assign(new Error('Not found'), { code: 'P2025' });
      if (resource === 'news' && [...records.news.values()].some(item => item.id !== id && 'slug' in item && item.slug === input.slug)) {
        throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      }
      const record = { ...existing, ...input, updatedAt: new Date().toISOString() } as ContentRecord;
      records[resource].set(id, record);
      return record;
    },
    async delete(resource: Resource, id: string) {
      if (!records[resource].delete(id)) {
        throw Object.assign(new Error('Not found'), { code: 'P2025' });
      }
    },
  };
}
