import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { readBackendEnv } from '../src/env.js';
import { createStaticDeployRunner, resolveNpmBuildCommand, syncStaticDirectory } from '../src/static-deploy.js';

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/aet_ai',
    SESSION_SECRET: 'a-very-secure-session-secret-of-at-least-32-chars',
    ...overrides,
  };
}

test('readBackendEnv validates STATIC_DEPLOY_DIR paths safely', () => {
  assert.equal(readBackendEnv(baseEnv({ STATIC_DEPLOY_DIR: '   ' })).staticDeployDir, undefined);
  assert.throws(() => readBackendEnv(baseEnv({ STATIC_DEPLOY_DIR: 'relative/out' })), /absolute/);
  const fsRoot = parse(resolve('.')).root;
  assert.throws(() => readBackendEnv(baseEnv({ STATIC_DEPLOY_DIR: fsRoot })), /filesystem root/);

  const validTarget = join(fsRoot, 'opt', '1panel', 'sites', 'aetpcr.site', 'index');
  assert.equal(readBackendEnv(baseEnv({ STATIC_DEPLOY_DIR: ` ${validTarget} ` })).staticDeployDir, validTarget);
});

test('resolveNpmBuildCommand locates npm CLI on Linux and Windows without shell invocation', () => {
  const linuxCli = resolveNpmBuildCommand('/home/ubuntu/.nvm/versions/node/v24.0.0/bin/node', {}, 'linux', candidate => (
    candidate.endsWith('/lib/node_modules/npm/bin/npm-cli.js')
  ));
  assert.equal(linuxCli.command, '/home/ubuntu/.nvm/versions/node/v24.0.0/bin/node');
  assert.match(linuxCli.args[0], /npm-cli\.js$/);
  assert.deepEqual(linuxCli.args.slice(1), ['run', 'build:web']);

  const linuxFallback = resolveNpmBuildCommand('/usr/bin/node', {}, 'linux', () => false);
  assert.deepEqual(linuxFallback, { command: 'npm', args: ['run', 'build:web'] });
});

test('syncStaticDirectory copies new files, skips unchanged files, removes stale routes, and preserves .well-known', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'aet-static-sync-'));
  try {
    const outDir = join(sandbox, 'out');
    const targetDir = join(sandbox, 'openresty-index');

    await mkdir(join(outDir, 'news', 'berita-baru'), { recursive: true });
    await writeFile(join(outDir, 'index.html'), '<html>v1</html>');
    await writeFile(join(outDir, '404.html'), '<html>404</html>');
    await writeFile(join(outDir, 'news', 'berita-baru', 'index.html'), '<html>berita baru</html>');

    // Pre-existing files in OpenResty directory: SSL challenge, stale slug, unchanged 404
    await mkdir(join(targetDir, '.well-known', 'acme-challenge'), { recursive: true });
    await writeFile(join(targetDir, '.well-known', 'acme-challenge', 'token-123'), 'acme-ok');
    await writeFile(join(targetDir, '.htaccess'), '# keep');
    await mkdir(join(targetDir, 'news', 'berita-lama'), { recursive: true });
    await writeFile(join(targetDir, 'news', 'berita-lama', 'index.html'), '<html>stale</html>');
    await writeFile(join(targetDir, '404.html'), '<html>404</html>');

    const first = await syncStaticDirectory(outDir, targetDir);
    assert.deepEqual(first, { copied: 2, skipped: 1, removed: 1 });
    assert.equal(await readFile(join(targetDir, 'index.html'), 'utf8'), '<html>v1</html>');
    assert.equal(await readFile(join(targetDir, 'news', 'berita-baru', 'index.html'), 'utf8'), '<html>berita baru</html>');
    assert.equal(await readFile(join(targetDir, '.well-known', 'acme-challenge', 'token-123'), 'utf8'), 'acme-ok');
    assert.equal(await readFile(join(targetDir, '.htaccess'), 'utf8'), '# keep');
    await assert.rejects(stat(join(targetDir, 'news', 'berita-lama')));

    const leftoverEntries = await readdir(targetDir);
    assert.equal(leftoverEntries.some(name => name.endsWith('.tmp')), false);

    // Syncing again with unchanged files skips everything
    const second = await syncStaticDirectory(outDir, targetDir);
    assert.deepEqual(second, { copied: 0, skipped: 3, removed: 0 });

    // Rejects overlapping or incomplete exports before modifying targetDir
    await assert.rejects(syncStaticDirectory(outDir, outDir), /tumpang tindih/);
    await assert.rejects(syncStaticDirectory(join(sandbox, 'empty-out'), targetDir), /tidak ditemukan/);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test('createStaticDeployRunner serializes builds, coalesces rapid triggers, and isolates failures', async () => {
  let builds = 0;
  let syncs = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const warnings: Record<string, unknown>[] = [];
  const infos: Record<string, unknown>[] = [];

  let releaseFirstBuild: (() => void) | undefined;
  const firstBuildGate = new Promise<void>(resolveWait => { releaseFirstBuild = resolveWait; });

  const runner = createStaticDeployRunner({
    deployDir: resolve(tmpdir(), 'aet-runner-target'),
    debounceMs: 10,
    runBuild: async () => {
      builds += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (builds === 1) await firstBuildGate;
      } finally {
        inFlight -= 1;
      }
    },
    sync: async () => {
      syncs += 1;
      return { copied: 1, skipped: 2, removed: 0 };
    },
    logger: {
      info: record => infos.push(record),
      warn: record => warnings.push(record),
    },
  });

  // Two rapid triggers before debounce expires collapse into the first build
  runner.trigger();
  runner.trigger();
  await new Promise(resolveWait => setTimeout(resolveWait, 25));
  assert.equal(builds, 1);

  // Multiple triggers while build #1 is still running coalesce into exactly one follow-up build
  runner.trigger();
  runner.trigger();
  releaseFirstBuild?.();
  await runner.whenIdle();

  assert.equal(maxInFlight, 1);
  assert.equal(builds, 2);
  assert.equal(syncs, 2);
  assert.equal(warnings.length, 0);
  assert.equal(infos.length, 2);

  // If build fails, sync never runs and failure is logged safely
  const failingRunner = createStaticDeployRunner({
    deployDir: resolve(tmpdir(), 'aet-runner-target'),
    debounceMs: 0,
    runBuild: async () => { throw new Error('simulated build failure'); },
    sync: async () => { throw new Error('sync should not run when build fails'); },
    logger: {
      info: () => {},
      warn: record => warnings.push(record),
    },
  });
  failingRunner.trigger();
  await failingRunner.whenIdle();
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, 'static_deploy_failed');
  failingRunner.close();
});
