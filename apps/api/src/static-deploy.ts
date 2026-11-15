import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, lstat, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTECTED_ROOT_ENTRIES = new Set(['.well-known', '.htaccess', '.user.ini']);
const DEFAULT_BUILD_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_DEBOUNCE_MS = 1500;
const OUTPUT_TAIL_LIMIT = 4096;

export interface StaticSyncStats {
  copied: number;
  skipped: number;
  removed: number;
}

export interface StaticDeployLogger {
  info(obj: Record<string, unknown>): void;
  warn(obj: Record<string, unknown>): void;
}

export interface StaticDeployRunnerOptions {
  deployDir: string;
  projectRoot?: string;
  debounceMs?: number;
  buildTimeoutMs?: number;
  runBuild?: () => Promise<void>;
  sync?: (sourceDir: string, targetDir: string) => Promise<StaticSyncStats>;
  logger?: StaticDeployLogger;
}

export interface StaticDeployRunner {
  trigger(): void;
  close(): void;
  whenIdle(): Promise<void>;
}

interface SourceFileEntry {
  relPath: string;
  fullPath: string;
  size: number;
}

/** Resolve workspace root whether executing from apps/api/src (dev) or apps/api/dist (prod). */
export function defaultProjectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export function resolveNpmBuildCommand(
  execPath = process.execPath,
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): { command: string; args: string[] } {
  const candidates = [
    env.npm_execpath,
    join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    resolve(dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    '/usr/lib/node_modules/npm/bin/npm-cli.js',
    '/usr/share/nodejs/npm/bin/npm-cli.js',
  ];
  const npmCli = candidates.find(candidate => candidate && /npm-cli\.js$/i.test(candidate) && exists(candidate));
  if (npmCli) return { command: execPath, args: [npmCli, 'run', 'build:web'] };
  if (platform !== 'win32') return { command: 'npm', args: ['run', 'build:web'] };
  throw new Error('npm CLI tidak ditemukan untuk menjalankan build:web.');
}

function appendTail(current: string, chunk: Buffer | string): string {
  const combined = `${current}${typeof chunk === 'string' ? chunk : chunk.toString('utf8')}`;
  return combined.length <= OUTPUT_TAIL_LIMIT ? combined : combined.slice(-OUTPUT_TAIL_LIMIT);
}

/** Extract trailing non-boilerplate error lines so npm lifecycle footers do not hide the root build error. */
export function summarizeBuildOutputTail(tail: string): string {
  const allLines = tail
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const meaningful = allLines.filter(line => !/^npm (?:error|notice)\b/i.test(line));
  const selected = (meaningful.length > 0 ? meaningful : allLines).slice(-8);
  const summary = selected.join(' | ');
  return summary.length <= 600 ? summary : `...${summary.slice(-597)}`;
}

/** Execute `npm run build:web` in the repository root with bounded logs and timeout. */
export async function runStaticWebBuild(
  options: { projectRoot?: string; timeoutMs?: number; streamOutput?: boolean } = {},
): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? defaultProjectRoot());
  const timeoutMs = options.timeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
  const streamOutput = options.streamOutput === true;
  const { command, args } = resolveNpmBuildCommand();
  const nodeBinDir = dirname(process.execPath);
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const env = pathEntries.includes(nodeBinDir)
    ? process.env
    : { ...process.env, PATH: [nodeBinDir, ...pathEntries].join(delimiter) };

  await new Promise<void>((resolvePromise, rejectPromise) => {
    let tail = '';
    let timedOut = false;
    let settled = false;
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    timer.unref();

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise();
    };

    child.stdout?.on('data', chunk => {
      tail = appendTail(tail, chunk);
      if (streamOutput) process.stdout.write(chunk);
    });
    child.stderr?.on('data', chunk => {
      tail = appendTail(tail, chunk);
      if (streamOutput) process.stderr.write(chunk);
    });
    child.once('error', error => finish(error));
    child.once('close', (code, signal) => {
      if (timedOut) {
        finish(new Error(`npm run build:web melewati batas waktu (${timeoutMs} ms).`));
        return;
      }
      if (code === 0) {
        finish();
        return;
      }
      const summary = summarizeBuildOutputTail(tail);
      finish(new Error(`npm run build:web gagal (kode=${code ?? 'null'}, sinyal=${signal ?? 'none'})${summary ? `: ${summary}` : ''}`));
    });
  });
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateSyncTargets(sourceDir: string, targetDir: string): { src: string; dst: string } {
  if (!isAbsolute(targetDir)) throw new Error('Direktori target deploy harus berupa path absolut.');
  const src = resolve(sourceDir);
  const dst = resolve(targetDir);
  if (parse(dst).root === dst) throw new Error('Direktori target deploy tidak boleh menunjuk langsung ke root filesystem.');
  if (src === dst || dst.startsWith(`${src}${sep}`) || src.startsWith(`${dst}${sep}`)) {
    throw new Error('Direktori sumber dan target deploy tidak boleh saling tumpang tindih.');
  }
  return { src, dst };
}

async function collectSourceTree(
  rootDir: string,
  relPrefix: string,
  depth: number,
  dirs: Set<string>,
  files: SourceFileEntry[],
): Promise<void> {
  const dirPath = relPrefix ? join(rootDir, relPrefix) : rootDir;
  for (const entry of await readdir(dirPath, { withFileTypes: true })) {
    if (depth === 0 && PROTECTED_ROOT_ENTRIES.has(entry.name)) continue;
    const relPath = relPrefix ? join(relPrefix, entry.name) : entry.name;
    const fullPath = join(rootDir, relPath);
    if (entry.isDirectory()) {
      dirs.add(relPath);
      await collectSourceTree(rootDir, relPath, depth + 1, dirs, files);
    } else if (entry.isFile()) {
      const info = await stat(fullPath);
      files.push({ relPath, fullPath, size: info.size });
    }
  }
}

async function ensureDirectory(path: string): Promise<void> {
  const existing = await lstat(path).catch(() => null);
  if (existing?.isDirectory()) {
    const uid = process.getuid?.();
    const canChmod = process.platform !== 'win32' && uid !== undefined && (uid === 0 || uid === existing.uid);
    if (canChmod && (existing.mode & 0o755) !== 0o755) {
      await chmod(path, 0o755);
    }
    return;
  }
  if (existing) {
    await rm(path, { recursive: true, force: true });
  }
  await mkdir(path, { recursive: true, mode: 0o755 });
  if (process.platform !== 'win32') await chmod(path, 0o755);
}

async function pruneStaleEntries(
  targetRoot: string,
  relPrefix: string,
  depth: number,
  validDirs: Set<string>,
  validFiles: Set<string>,
): Promise<number> {
  const dirPath = relPrefix ? join(targetRoot, relPrefix) : targetRoot;
  let removed = 0;
  for (const entry of await readdir(dirPath, { withFileTypes: true })) {
    if (depth === 0 && PROTECTED_ROOT_ENTRIES.has(entry.name)) continue;
    const relPath = relPrefix ? join(relPrefix, entry.name) : entry.name;
    const fullPath = join(targetRoot, relPath);
    if (entry.isDirectory()) {
      if (!validDirs.has(relPath)) {
        await rm(fullPath, { recursive: true, force: true });
        removed += 1;
      } else {
        removed += await pruneStaleEntries(targetRoot, relPath, depth + 1, validDirs, validFiles);
      }
    } else if (!validFiles.has(relPath)) {
      await rm(fullPath, { force: true });
      removed += 1;
    }
  }
  return removed;
}

/** Synchronize verified static export output into the public web root without touching 1Panel ACME/SSL files. */
export async function syncStaticDirectory(sourceDir: string, targetDir: string): Promise<StaticSyncStats> {
  const { src, dst } = validateSyncTargets(sourceDir, targetDir);
  const [hasIndex, has404] = await Promise.all([
    stat(join(src, 'index.html')).then(value => value.isFile()).catch(() => false),
    stat(join(src, '404.html')).then(value => value.isFile()).catch(() => false),
  ]);
  if (!hasIndex || !has404) {
    throw new Error('Output static export belum lengkap (index.html atau 404.html tidak ditemukan).');
  }

  const dirs = new Set<string>();
  const files: SourceFileEntry[] = [];
  await collectSourceTree(src, '', 0, dirs, files);

  await ensureDirectory(dst);
  const sortedDirs = [...dirs].sort((a, b) => a.length - b.length);
  for (const relDir of sortedDirs) {
    await ensureDirectory(join(dst, relDir));
  }

  let copied = 0;
  let skipped = 0;
  let tmpCounter = 0;
  for (const file of files) {
    const destPath = join(dst, file.relPath);
    const existing = await lstat(destPath).catch(() => null);
    if (existing && !existing.isFile()) {
      await rm(destPath, { recursive: true, force: true });
    }
    const srcBytes = await readFile(file.fullPath);
    if (existing?.isFile() && existing.size === file.size) {
      const existingBytes = await readFile(destPath).catch(() => null);
      if (existingBytes && sha256(existingBytes) === sha256(srcBytes)) {
        skipped += 1;
        continue;
      }
    }
    tmpCounter += 1;
    const tmpPath = join(dirname(destPath), `.deploy-${process.pid}-${tmpCounter}.tmp`);
    try {
      await writeFile(tmpPath, srcBytes, { mode: 0o644 });
      if (process.platform !== 'win32') await chmod(tmpPath, 0o644);
      await rename(tmpPath, destPath);
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
    copied += 1;
  }

  const validFiles = new Set(files.map(file => file.relPath));
  const removed = await pruneStaleEntries(dst, '', 0, dirs, validFiles);
  return { copied, skipped, removed };
}

/** Single-flight debounced runner that coalesces rapid CMS changes and never overlaps builds. */
export function createStaticDeployRunner(options: StaticDeployRunnerOptions): StaticDeployRunner {
  const projectRoot = resolve(options.projectRoot ?? defaultProjectRoot());
  const outDir = join(projectRoot, 'apps', 'web', 'out');
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const runBuild = options.runBuild ?? (() => runStaticWebBuild({ projectRoot, timeoutMs: options.buildTimeoutMs }));
  const sync = options.sync ?? syncStaticDirectory;

  let closed = false;
  let pending = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activePromise: Promise<void> | null = null;

  const runLoop = async () => {
    running = true;
    try {
      while (pending && !closed) {
        pending = false;
        const startedAt = Date.now();
        try {
          await runBuild();
          if (closed) break;
          const stats = await sync(outDir, options.deployDir);
          options.logger?.info({
            event: 'static_deploy_succeeded',
            ...stats,
            durationMs: Date.now() - startedAt,
          });
        } catch (error) {
          options.logger?.warn({
            event: 'static_deploy_failed',
            message: error instanceof Error ? error.message.slice(0, 240) : 'Static deploy gagal.',
            durationMs: Date.now() - startedAt,
          });
        }
      }
    } finally {
      running = false;
      activePromise = null;
    }
  };

  const kick = () => {
    if (closed || running || !pending) return;
    activePromise = runLoop();
  };

  return {
    trigger() {
      if (closed) return;
      pending = true;
      if (running) return;
      if (timer) clearTimeout(timer);
      if (debounceMs <= 0) {
        kick();
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        kick();
      }, debounceMs);
      timer.unref();
    },
    close() {
      closed = true;
      pending = false;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    async whenIdle() {
      while (timer || activePromise) {
        if (timer) {
          await new Promise<void>(resolveWait => {
            const check = () => {
              if (!timer || closed) resolveWait();
              else setTimeout(check, 5);
            };
            check();
          });
        }
        if (activePromise) await activePromise;
      }
    },
  };
}
