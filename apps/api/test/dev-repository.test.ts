import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createDevFallbackRepository, seedDevFallbackAdmin } from '../src/dev-repository.js';
import type { BackendEnv } from '../src/env.js';

const origin = 'http://localhost:3000';
const devUsername = 'dev-operator';
const devPassword = 'disposable-dev-password-32';

function devEnv(): BackendEnv {
  return {
    databaseUrl: 'postgresql://unused-dev/unused',
    sessionSecret: randomBytes(32).toString('hex'),
    appOrigins: [origin],
    production: false,
    port: 4000,
    cookieSameSite: 'lax',
  };
}

test('seedDevFallbackAdmin refuses to seed in production mode', async () => {
  const repository = createDevFallbackRepository(null);
  const warnings: string[] = [];

  assert.equal(await seedDevFallbackAdmin(repository, {
    production: true,
    env: { DEV_ADMIN_USERNAME: devUsername, DEV_ADMIN_PASSWORD: devPassword },
    warn: message => warnings.push(message),
  }), false);
  assert.equal(await seedDevFallbackAdmin(repository, {
    env: { NODE_ENV: 'production', DEV_ADMIN_USERNAME: devUsername, DEV_ADMIN_PASSWORD: devPassword },
    warn: message => warnings.push(message),
  }), false);
  assert.equal(await repository.findAdmin(devUsername), null);
  assert.deepEqual(warnings, []);
});

test('seedDevFallbackAdmin validates optional dev credentials without throwing', async () => {
  const repository = createDevFallbackRepository(null);
  const missingWarnings: string[] = [];
  assert.equal(await seedDevFallbackAdmin(repository, {
    env: {},
    warn: message => missingWarnings.push(message),
  }), false);
  assert.equal(missingWarnings.length, 1);

  const invalidWarnings: string[] = [];
  assert.equal(await seedDevFallbackAdmin(repository, {
    env: { DEV_ADMIN_USERNAME: 'ab', DEV_ADMIN_PASSWORD: 'short' },
    warn: message => invalidWarnings.push(message),
  }), false);
  assert.equal(invalidWarnings.length, 1);
  assert.equal(await repository.findAdmin('ab'), null);
});

test('seedDevFallbackAdmin allows logging in to admin routes only on the in-memory fallback', async () => {
  const repository = createDevFallbackRepository(null);
  const warnings: string[] = [];
  const seeded = await seedDevFallbackAdmin(repository, {
    production: false,
    env: { NODE_ENV: 'development', DEV_ADMIN_USERNAME: ` ${devUsername} `, DEV_ADMIN_PASSWORD: devPassword },
    warn: message => warnings.push(message),
  });
  assert.equal(seeded, true);
  assert.equal(warnings.length, 1);

  const app = await buildApp({ repository, env: devEnv() });
  try {
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin },
      payload: { username: devUsername, password: 'wrong-password-123' },
    });
    assert.equal(rejected.statusCode, 401);

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin },
      payload: { username: devUsername, password: devPassword },
    });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = `${login.cookies[0].name}=${encodeURIComponent(login.cookies[0].value)}`;
    const me = await app.inject({ url: '/v1/auth/me', headers: { cookie } });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().user.username, devUsername);
    assert.equal((await app.inject({ url: '/v1/admin/news', headers: { cookie } })).statusCode, 200);
  } finally {
    await app.close();
  }
});
