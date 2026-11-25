const string = description => ({ type: 'string', description });
const object = { type: 'object', additionalProperties: true };
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const tool = (name, description, inputSchema, readOnly = false) => ({ name, description, inputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: !readOnly } });
export const TOOLS = [
  tool('open_video_studio', '在 Codex 内直接打开视频工作台插件面板，支持聊天内嵌和全屏；不需要浏览器地址。打开本身不访问模型服务，不产生生成费用。连接配置和密钥在内嵌面板填写。', schema({}), true),
  tool('video_studio_status', '查看独立视频插件配置状态；只返回摘要，不返回密钥、连接地址或凭据引用。', schema({}), true),
  tool('video_models', '查看原压缩包随附的模型示例和默认值。source=bundled-unverified；不代表实时可用性，不要据此宣称最新模型。精确模型及协议由用户在面板设置。', schema({}), true),
  tool('video_generate', '提交视频生成或再创作并立即返回持久任务编号。使用稳定 requestId；重复同一请求不会重复提交。只有用户授权本次生成后设 confirmed=true。demo 明确使用固定样例，不是提示词生成的视频。未知提交结果用 video_job 查询，不可自动新建任务重试。真实配置缺失会报错，不会换供应商或退回演示。', schema({
    requestId: string('稳定唯一请求编号，8–128 位；断线后用于查询'), confirmed: { type: 'boolean' }, sessionId: string('可选会话/项目标识，默认 default'), prompt: string('完整视频提示词，保留全局与本镜头的环境、时间、光源和色调'), model: string('明确模型 ID；不传时使用已保存模型'), mode: { type: 'string', enum: ['text2video', 'image2video', 'firstlast', 'reference', 'edit', 'extend', 'draft', 'draft-final'] }, params: object, inputs: object, workspaceImages: { type: 'array', items: string('本地图片绝对路径') }, sourceId: string('再创作来源 recordId；同一 sessionId'), draftTaskId: string('样片转正式使用的远端草稿 ID'),
    sketchReference: { ...schema({ project: string('已确认的分镜项目名称'), shot: string('已有草图的镜头 ID') }, ['project', 'shot']), description: '仅在用户保存的草图参考开关开启、build-prompt 返回 referenceImage 时使用；mode 必须为 reference，不能同时传 sourceId。服务端读取对应分镜草图，无需重复上传。' }
  }, ['requestId', 'confirmed'])),
  tool('video_job', '按 job.id 或原 requestId 查询任务状态。waitSeconds 最多 20 秒。超时后继续查询同一个任务，不重发。只返回状态、模型和本地媒体路径，不返回原始服务商响应。', schema({ id: string('job.id 或 requestId'), waitSeconds: { type: 'integer', minimum: 0, maximum: 20 } }, ['id']), true),
  tool('video_history', '查持久任务历史，恢复丢失的任务编号，包括中断和失败任务；不触发生成。', schema({ sessionId: string('可选按会话筛选'), limit: { type: 'integer', minimum: 1, maximum: 200 } }), true),
  tool('video_cancel', '取消指定视频任务；服务商不支持时明确报错。取消不保证免除已经发生的费用。', schema({ id: string('job.id 或 requestId') }, ['id'])),
  tool('video_project', '编导工作台：项目/人物卡（基础身份+形象变体+三视图）/区域/幕/分镜（归属幕+区域+出场人物）/提示词/验收/抽帧/版本。保存设定或分镜会重置确认；只有用户已确认内容才可 confirm-plan confirmed=true。sketch 需要单镜头 shot、稳定 requestId、独立图像配置和用户付费授权，返回异步 job。analyze 仅抽帧和核对清单，Codex 应实际查看图片后回填 observed，不虚构视觉判断。full-video 归档已存在的全片，不自动剪辑拼接。', schema({
    action: { type: 'string', enum: ['create', 'list', 'get', 'delete', 'guide', 'save-characters', 'character-sheet', 'save-areas', 'area-sheet', 'save-acts', 'save-shots', 'confirm-plan', 'shot-change', 'build-prompt', 'sketch', 'save-version', 'review', 'analyze', 'full-video', 'location'] }, project: string('项目名称'), shot: string('镜头 ID'), payload: object, sourcePath: string('归档视频的本地路径'), taskId: string('原视频 recordId'), detail: string('说明'), confirmed: { type: 'boolean' }, requestId: string('付费草图稳定请求编号')
  }, ['action']))
];
