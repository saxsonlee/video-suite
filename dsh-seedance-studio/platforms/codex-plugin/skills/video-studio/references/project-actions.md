# Project payloads

All examples are arguments to `video_project`. `payload` is an object, not a JSON string. Project names identify separate local folders under the plugin data directory.

Create: `{ "action":"create", "project":"雨夜街角", "payload":{"style":"写实电影感","baseline":{"model":"用户选择的精确模型","resolution":"720p","ratio":"16:9","seed":42}} }`.

Characters: `{ "action":"save-characters", "project":"雨夜街角", "payload":{"characters":[{"name":"阿澈","appearance":"短黑发，灰色风衣","age":"25岁","hair":"短黑发","costume":"灰色风衣"}]} }`.

Shots: `{ "action":"save-shots", "project":"雨夜街角", "payload":{"style":"写实电影感","baseline":{"resolution":"720p","ratio":"16:9","seed":42},"sceneMap":{"environment":"夜晚，小雨，冷蓝霓虹与暖黄路灯，湿地反光"},"shots":[{"id":"Shot1","shotType":"中景","camera":"平视","action":"阿澈走过雨中的街角","environment":"夜晚，小雨，暖黄路灯从左侧照亮角色，冷蓝背景","dialogue":"无","movement":"跟拍","duration":5,"characters":["阿澈"],"task":"交代人物与环境"}]} }`.

`save-shots` replaces the storyboard. Include retained style, notes, baseline and sceneMap in the payload so they are not accidentally erased. For characters, preserve all intended character cards when saving.

After approval: `{ "action":"confirm-plan", "project":"雨夜街角", "confirmed":true }`. Then `{ "action":"build-prompt", "project":"雨夜街角", "shot":"Shot1" }` returns prompt and generation params. Inspect warnings and preserve the approved shot's intended scope.

When the user has saved the sketch-reference option and this shot has a usable sketch, `build-prompt` also offers `referenceImage`. To use it, call `video_generate` with the returned prompt/params and `{"requestId":"stable-video-request-id","confirmed":true,"mode":"reference","sketchReference":{"project":"雨夜街角","shot":"Shot1"}}`. This still requires authorization for the video generation. Leave `sketchReference` absent when the user does not want it; no sketch generation is triggered by this reference option.

`get` returns `project.name`, `project.path`, `project.characters`, `project.shots.shots`, `project.shots.baseline`, `project.shots.planConfirmed`, and `project.video`. `list` returns summaries.

Review template: `{ "action":"review", "project":"雨夜街角", "shot":"Shot1" }`. Submit the actual observed `checks:[{key,pass,note}]` in payload.

Extract: `{ "action":"analyze", "project":"雨夜街角", "shot":"Shot1", "payload":{"videoPath":"C:/absolute/clip.mp4","count":4} }`. Inspect returned frames, then submit the same action with `payload.observed:[{key,pass,note}]` according to its checklist.

Archive a clip: `{ "action":"save-version", "project":"雨夜街角", "shot":"Shot1", "sourcePath":"C:/absolute/clip.mp4", "taskId":"sd_...", "payload":{"model":"actual-model","prompt":"actual-prompt","params":{"seed":42}} }`. Version numbers increment automatically.

Sketch one shot: `{ "action":"sketch", "project":"雨夜街角", "shot":"Shot1", "requestId":"unique-stable-id", "confirmed":true }`. The result includes a job receipt. It does not automatically submit a video or generate every shot.
