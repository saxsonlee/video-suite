"""Zip the generated Codex platform only; never collect files from the source tree."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[2]
source = root / 'dist' / 'codex'
info = json.loads((source / 'build-info.json').read_text(encoding='utf-8'))
if info.get('layout') != 'seedance-platforms-v1' or info.get('platform') != 'codex':
    raise SystemExit('Run node scripts/pack.mjs --platform codex first.')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path, default=root / 'dist' / f"seedance-studio-codex-{info['version']}.zip")
args = parser.parse_args()
destination = args.out.resolve()
if destination.is_relative_to(source.resolve()):
    raise SystemExit('Archive must be outside dist/codex/.')
if destination.exists():
    raise SystemExit('Archive already exists; choose a new --out path.')
for relative, expected in info['files_sha256'].items():
    file = (source / relative).resolve()
    if not file.is_relative_to(source.resolve()) or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
        raise SystemExit('Generated package hash mismatch: ' + relative)
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in sorted(source.rglob('*')):
        if file.is_file():
            archive.write(file, Path('codex') / file.relative_to(source))
with zipfile.ZipFile(destination) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Archive integrity check failed.')
    names = set(archive.namelist())
    for name in ['install.cmd', '.codex-plugin/plugin.json', '.mcp.json', 'platforms/codex-plugin/server/mcp.mjs', info['panel'], 'skills/video-studio/SKILL.md', 'node_modules/@modelcontextprotocol/sdk/package.json']:
        if 'codex/' + name not in names:
            raise SystemExit('Missing release file: ' + name)
sha = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix('.zip.sha256').write_text(sha + '  ' + destination.name + '\n', encoding='ascii')
print(json.dumps({'archive': str(destination), 'files': len(names), 'bytes': destination.stat().st_size, 'sha256': sha}, ensure_ascii=False))
