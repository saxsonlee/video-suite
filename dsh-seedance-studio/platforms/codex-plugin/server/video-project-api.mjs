import path from 'node:path';
import fs from 'node:fs';
import { createProjects } from '../vendor/video-project/server/projects.js';
import { checkEnvironment } from '../vendor/video-project/server/env-check.js';
import { readImageGenSettings, saveImageGenSettings, fetchImageCandidates } from '../vendor/video-project/server/image-settings.js';

/** 视频项目 API 前缀。 */
export const VIDEO_PROJECT_PREFIX = '/api/video-project';

export function createVideoProjectApi(options = {}) {
  const root = options.root;
  const projectsRoot = path.join(root, 'projects');
  const projects = createProjects({ root: projectsRoot });
  function storageLocation() {
    try {
      if (projects.readLocation) return projects.readLocation();
    } catch (error) { /* 无定位信息时返回默认 */ }
    return { storageRoot: root, projectsRoot };
  }
  const settingsFile = path.join(root, 'video-project-settings.json');
  const settingsEnv = { ...process.env, VIDEO_PROJECT_CONFIG_FILE: settingsFile };
  return {
    prefix: VIDEO_PROJECT_PREFIX,
    projectsRoot,
    async handle(method, pathname, searchParams, body) {
      // 环境自检（面板「环境检查」卡片）：ffmpeg / Node / 目录可写性
    if (pathname === VIDEO_PROJECT_PREFIX + '/env' && method === 'GET') {
      try {
        return { status: 200, value: { ok: true, value: checkEnvironment({ env: process.env }) } };
      } catch (error) {
        return { status: 500, value: { ok: false, error: { code: 'ENV_CHECK_FAILED', message: String(error && error.message || error) } } };
      }
    }
    if (pathname === VIDEO_PROJECT_PREFIX + '/projects' && method === 'GET') {
        const list = await projects.listProjects();
        return { status: 200, value: { ok: true, value: { projects: list, storageRoot: storageLocation().storageRoot || '', projectsRoot } } };
      }
      if (pathname === VIDEO_PROJECT_PREFIX + '/settings' && (method === 'GET' || method === 'POST')) {
        try {
          if (method === 'POST') {
            const saved = saveImageGenSettings(body || {}, { env: settingsEnv, configFile: settingsFile });
            return { status: 200, value: { ok: true, value: saved.settings } };
          }
          return { status: 200, value: { ok: true, value: readImageGenSettings({ env: settingsEnv, configFile: settingsFile }) } };
        } catch (error) {
          return { status: 400, value: { ok: false, error: { code: error && error.code ? String(error.code) : 'SettingsError', message: error && error.message ? String(error.message) : String(error) } } };
        }
      }
      if (pathname === VIDEO_PROJECT_PREFIX + '/models' && method === 'GET') {
        try {
          const result = await fetchImageCandidates({ env: settingsEnv, configFile: settingsFile });
          return { status: 200, value: { ok: true, value: { models: result.models, source: result.source, error: result.error } } };
        } catch (error) {
          return { status: 400, value: { ok: false, error: { code: 'MODELS_ERROR', message: error && error.message ? String(error.message) : String(error) } } };
        }
      }
      if (pathname === VIDEO_PROJECT_PREFIX + '/project' && method === 'GET') {
        const name = String(searchParams.get('name') || '').trim();
        if (!name) return { status: 400, value: { ok: false, error: { code: 'INVALID_PROJECT', message: '缺少 name 参数（项目名）' } } };
        try {
          const project = await projects.getProject(name);
          return { status: 200, value: { ok: true, value: { project } } };
        } catch (error) {
          const status = error && error.status === 404 ? 404 : 400;
          return { status, value: { ok: false, error: { code: error && error.code ? String(error.code) : 'ProjectError', message: error && error.message ? String(error.message) : String(error) } } };
        }
      }
      if (pathname === VIDEO_PROJECT_PREFIX + '/project' && method === 'POST') {
        const payload = body && typeof body === 'object' ? body : {};
        const name = String(payload.name || '').trim();
        if (!name) return { status: 400, value: { ok: false, error: { code: 'INVALID_PROJECT', message: '缺少 name（项目名）' } } };
        try {
          const action = String(payload.action || 'meta');
          if (action === 'create') return { status: 200, value: { ok: true, value: { project: await projects.createProject(name, payload.payload || {}) } } };
          if (action === 'meta') return { status: 200, value: { ok: true, value: await projects.updateProjectMeta(name, payload.patch || {}) } };
          if (action === 'characters') return { status: 200, value: { ok: true, value: await projects.saveCharacters(name, payload.characters || []) } };
          if (action === 'areas') return { status: 200, value: { ok: true, value: await projects.saveAreas(name, payload.areas || []) } };
          if (action === 'acts') return { status: 200, value: { ok: true, value: await projects.saveActs(name, payload.acts || []) } };
          if (action === 'shots') return { status: 200, value: { ok: true, value: await projects.saveShots(name, { shots: payload.shots || [] }) } };
          if (action === 'delete') {
            if (!name) return { status: 400, value: { ok: false, error: { code: 'INVALID_DELETE', message: '缺少项目名' } } }
            return { status: 200, value: { ok: true, value: await projects.deleteProject(name) } }
          }
          if (action === 'review') {
            if (!payload.shot) return { status: 400, value: { ok: false, error: { code: 'INVALID_REVIEW', message: '需要 shot' } } }
            return { status: 200, value: { ok: true, value: await projects.saveShotReview(name, payload.shot, { version: payload.version, pass: payload.pass, checks: payload.checks, issues: payload.issues, notes: payload.notes, feedback: payload.feedback }) } }
          }
          if (action === 'clear-review') {
            if (!payload.shot || !payload.version) return { status: 400, value: { ok: false, error: { code: 'INVALID_CLEAR_REVIEW', message: '需要 shot、version' } } }
            return { status: 200, value: { ok: true, value: await projects.clearShotReview(name, payload.shot, payload.version) } }
          }
          if (action === 'adopt-version') {
            if (!payload.shot || !payload.version) return { status: 400, value: { ok: false, error: { code: 'INVALID_ADOPT', message: '需要 shot、version' } } }
            return { status: 200, value: { ok: true, value: await projects.setAdoptedVersion(name, payload.shot, payload.version) } }
          }
          if (action === 'version-note') {
            const result = await projects.addShotVersionNote(name, payload.shot, payload.version, payload.note)
            return { status: 200, value: { ok: true, value: result } }
          }
          return { status: 400, value: { ok: false, error: { code: 'UNKNOWN_ACTION', message: '未知操作：' + action } } };
        } catch (error) {
          return { status: 400, value: { ok: false, error: { code: error && error.code ? String(error.code) : 'ProjectError', message: error && error.message ? String(error.message) : String(error) } } };
        }
      }
      return { status: 404, value: { ok: false, error: { code: 'NOT_FOUND', message: '接口不存在' } } };
    }
  };
}
