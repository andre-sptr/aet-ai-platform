import { join, resolve } from 'node:path';
import { defaultProjectRoot, runStaticWebBuild, syncStaticDirectory } from '../apps/api/src/static-deploy.js';

const deployDir = process.env.STATIC_DEPLOY_DIR?.trim();
if (!deployDir) {
  console.error('STATIC_DEPLOY_DIR belum diatur di .env. Contoh: STATIC_DEPLOY_DIR=/opt/1panel/apps/openresty/openresty/www/sites/aetpcr.site/index');
  process.exitCode = 1;
} else {
  const root = defaultProjectRoot();
  const outDir = join(root, 'apps', 'web', 'out');
  await runStaticWebBuild({ projectRoot: root });
  const stats = await syncStaticDirectory(outDir, resolve(deployDir));
  console.log(`Static website deployed to ${resolve(deployDir)} (copied=${stats.copied}, skipped=${stats.skipped}, removed=${stats.removed}).`);
}
