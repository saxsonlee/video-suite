import fs from 'node:fs';
import path from 'node:path';

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function resolved(file) {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  const parent = path.dirname(file);
  if (parent === file) return file;
  return path.join(resolved(parent), path.basename(file));
}
export function assertPackDestination(sourceRoot, output, platform) {
  const root = resolved(path.resolve(sourceRoot));
  const out = resolved(path.resolve(output));
  const dest = resolved(path.resolve(output, platform));
  const permittedDist = path.join(root, 'dist');
  if (within(out, root) || (within(root, out) && !within(permittedDist, out))) {
    throw new Error('打包输出不能覆盖源码；请使用 dist 或工程外的独立输出目录。');
  }
  if (path.dirname(dest) !== out || path.basename(dest) !== platform || within(dest, root)) {
    throw new Error('打包目标越过指定输出目录，拒绝清理：' + platform);
  }
  if (fs.existsSync(dest)) {
    const pkgFile = path.join(dest, 'package.json');
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')); } catch {}
    if (!pkg || !['dsh-seedance-studio', 'dsh-seedance-studio-cli', 'dsh-seedance-studio-web', 'codex-video-studio'].includes(pkg.name)) {
      throw new Error('拒绝覆盖非本项目的既有目录：' + dest);
    }
  }
  return dest;
}
