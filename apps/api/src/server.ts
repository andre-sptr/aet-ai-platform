import { buildApp } from './app.js';
import { readBackendEnv } from './env.js';
import { createPrismaRepository, type Repository } from './repository.js';

const env = readBackendEnv();
let repository: Repository = await createPrismaRepository(env.databaseUrl);
if (!env.production) {
  try {
    await repository.ping();
  } catch {
    await repository.close?.().catch(() => {});
    const { createDevFallbackRepository } = await import('./dev-repository.js');
    repository = createDevFallbackRepository();
    console.warn('PostgreSQL tidak tersedia; memakai penyimpanan in-memory development (data/legacy-content.json).');
  }
}
const app = await buildApp({ env, repository });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}
await app.listen({ host: '0.0.0.0', port: env.port });
console.info(`AET API listening on port ${env.port}`);
