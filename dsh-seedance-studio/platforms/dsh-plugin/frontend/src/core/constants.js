    // ==========================================================================
    // 常量
    // ==========================================================================
    const MAX_PROMPT_CHARS = 20000;
    const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
    const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
    const HISTORY_POLL_MS = 2500;
    /** 示例提示词（label/text 为 i18n key，渲染时 translate()）。 */
    const PROMPT_TEMPLATES = [
      { label: 'template.cinematic.label', text: 'template.cinematic.text' },
      { label: 'template.product.label', text: 'template.product.text' },
      { label: 'template.portrait.label', text: 'template.portrait.text' },
      { label: 'template.ink.label', text: 'template.ink.text' },
    ];
    /** 创作模式（label 为 i18n key）。 */
    const MODES = [
      { id: 'text2video', label: 'mode.text2video', icon: 'text', needs: 'none' },
      { id: 'image2video', label: 'mode.image2video', icon: 'image', needs: 'first' },
      { id: 'firstlast', label: 'mode.firstlast', icon: 'frames', needs: 'firstlast' },
      { id: 'reference', label: 'mode.reference', icon: 'layers', needs: 'reference' },
      { id: 'edit', label: 'mode.edit', icon: 'edit', needs: 'video' },
      { id: 'draft', label: 'mode.draft', icon: 'draft', needs: 'none' },
    ];
    /** 模式短标签（i18n key）。 */
    const MODE_LABELS = {
      text2video: 'mode.text2video', image2video: 'mode.image2video', firstlast: 'mode.firstlast', reference: 'mode.reference',
      edit: 'mode.edit', extend: 'mode.extend', draft: 'mode.draft', 'draft-final': 'mode.draftFinal',
    };
    /** 参考估算价格表（元；按 16:9 / 5s 基准，实际以账单为准；仅用于 UI 提示）。 */
    const COST_TABLE = {
      'doubao-seedance-2-5-260628': { '480p': 3.36, '720p': 7.56, '1080p': 18.71 },
      'doubao-seedance-2-0-260128': { '480p': 2.31, '720p': 4.97, '1080p': 12.39, '4k': 25.27 },
      'doubao-seedance-2-0-fast-260128': { '480p': 1.86, '720p': 4.00 },
      'doubao-seedance-2-0-mini-260615': { '480p': 1.16, '720p': 2.48 },
    };
    /** 任务状态元信息（label 为 i18n key）。 */
    const STATUS_META = {
      queued: { label: 'status.queued', tone: 'info', progress: 8 },
      running: { label: 'status.running', tone: 'info', progress: 52 },
      succeeded: { label: 'status.succeeded', tone: 'success', progress: 100 },
      failed: { label: 'status.failed', tone: 'error', progress: 100 },
      cancelled: { label: 'status.cancelled', tone: 'muted', progress: 0 },
      expired: { label: 'status.expired', tone: 'warn', progress: 100 },
    };
    /** 画面比例选项（label 为 i18n key）。 */
    const RATIO_OPTIONS = [
      { value: 'adaptive', label: 'ratio.adaptive' },
      { value: '16:9', label: 'ratio.horizontal' },
      { value: '9:16', label: 'ratio.vertical' },
      { value: '1:1', label: 'ratio.square' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
      { value: '21:9', label: 'ratio.widescreen' },
    ];

    /** 内置模型目录（与 /api/seedance/config 对齐；宿主未就绪时的兜底）。 */
    const FALLBACK_MODELS = [
      {
        id: 'doubao-seedance-2-5-260628', label: 'Seedance 2.5', family: '2.5',
        durations: [4, 30], autoDuration: true, defaultDuration: -1,
        defaultResolution: '720p', defaultRatio: 'adaptive',
        resolutions: ['480p', '720p', '1080p'],
        ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
        audio: true, audioAlone: true, firstFrame: true, lastFrame: true, references: true,
        draft: true, cameraFixed: false, outputFormats: ['mp4', 'mov'], omniReference: true,
        maxImages: 30, maxVideos: 10, maxAudios: 10, deprecated: false,
        noteKey: 'modelNotes.2-5',
      },
      {
        id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0', family: '2.0',
        durations: [4, 15], autoDuration: true, defaultDuration: 5,
        defaultResolution: '720p', defaultRatio: 'adaptive',
        resolutions: ['480p', '720p', '1080p', '4k'],
        ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
        audio: true, audioAlone: false, firstFrame: true, lastFrame: true, references: true,
        draft: false, cameraFixed: false, outputFormats: ['mp4'], omniReference: false,
        maxImages: 9, maxVideos: 3, maxAudios: 3, deprecated: false,
        noteKey: 'modelNotes.2-0',
      },
      {
        id: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast', family: '2.0',
        durations: [4, 15], autoDuration: true, defaultDuration: 5,
        defaultResolution: '720p', defaultRatio: 'adaptive',
        resolutions: ['480p', '720p'],
        ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
        audio: true, audioAlone: false, firstFrame: true, lastFrame: true, references: true,
        draft: false, cameraFixed: false, outputFormats: ['mp4'], omniReference: false,
        maxImages: 9, maxVideos: 3, maxAudios: 3, deprecated: false,
        noteKey: 'modelNotes.2-0-fast',
      },
      {
        id: 'doubao-seedance-2-0-mini-260615', label: 'Seedance 2.0 Mini', family: '2.0',
        durations: [4, 15], autoDuration: true, defaultDuration: 5,
        defaultResolution: '720p', defaultRatio: 'adaptive',
        resolutions: ['480p', '720p'],
        ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
        audio: true, audioAlone: false, firstFrame: true, lastFrame: true, references: true,
        draft: false, cameraFixed: false, outputFormats: ['mp4'], omniReference: false,
        maxImages: 9, maxVideos: 3, maxAudios: 3, deprecated: false,
        noteKey: 'modelNotes.2-0-mini',
      },
    ];
    const FALLBACK_DEFAULTS = {
      defaultModel: 'doubao-seedance-2-5-260628',
      defaultDuration: -1,
      defaultRatio: 'adaptive',
      defaultResolution: '720p',
    };
    const FALLBACK_CONFIG = {
      provider: 'unknown',
      demo: true,
      models: FALLBACK_MODELS,
      defaults: FALLBACK_DEFAULTS,
      settings: {},
      capabilities: {},
    };

    /** 模块级内存（面板切换后仍保留草稿与会话选择；不写 localStorage 以免密钥/图片入库）。 */
    const MEMORY = { form: null, manualSessionId: '' };
