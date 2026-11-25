---
name: video-studio
description: Create and manage video projects with the Video Studio plugin, including video generation, characters, storyboards, job tracking, frame review, and version archives. Use when the user asks to use this video studio or generate a video through its configured provider.
---

# Video Studio

Version 0.2.3 is the shared-SPA integration candidate. The embedded page currently
exposes generation, history, playback and basic video settings. The project,
environment, image-settings, catalog-discovery, QA and archive editors await
migration by the shared-SPA owner. Use the existing chat tools for supported
project actions; do not claim these editors are already present or that a
metadata response proves they rendered. Do not infer an image or provider
configuration from the old shared-page hints. See SPA-INTEGRATION.md for the
remaining shared-interface work.

Use the plugin's `video_studio` MCP tools. Call `open_video_studio` to open the native embedded MCP App directly inside Codex. The tool is bound to a `ui://video-studio/` resource, with chat and global entry points and inline/fullscreen support. Do not use `open_in_codex` to open a localhost browser tab. Connection settings and write-only API keys belong in the embedded panel. The two app-only tools are private UI transport, not model-facing inspection tools. Do not read their private metadata, settings, credentials, or runtime descriptors into model context. If the host has not reloaded the installed plugin, explain that limitation; a successful metadata response alone is not proof the panel rendered.

`video_studio_status` reports the current route without credentials or upstream URLs. The default is an explicit demo using the package's fixed sample video. Always distinguish that sample from a video generated from the user's prompt. Real mode requires the user's provider, explicit protocol, exact model, and credentials. `video_models` contains examples copied from the source archive; it is not a live catalog or proof of model availability. Catalog discovery is an explicit action in the panel. Do not change providers/models after errors.

For generation, preserve the user's prompt and parameters, and use `video_generate` with a stable unique `requestId`. Set `confirmed:true` only if the user has authorized this generation. Authorization already supplied in the conversation is sufficient. Do not introduce an extra confirmation for every step of an already authorized workflow. A request to inspect or configure is not permission to submit a paid job. The backend returns a durable `job.id` before generation finishes.

Use `video_job` with that ID or requestId (`waitSeconds` up to 20) to follow progress; `video_history` recovers lost receipts. A local timeout does not cancel the task. An `interrupted` submission has an unknown external outcome: check provider records with the user before authorizing any new submission. Never automatically retry with a new request ID. `video_cancel` reports actual provider cancellation support. Only claim success after a succeeded/completed result; a receipt alone is not a completed video.

Successful job results contain local `videoPath`/`lastFramePath`. Render videos or images with Markdown image syntax and absolute paths. Provider replies are summarized; avoid reading raw task storage to obtain hidden provider responses.

Use `video_project` for characters and storyboards when the user wants a planned or multi-shot project. Keep the user's existing scope: a simple authorized single-shot request does not require inventing a full project. Detailed payload examples are in [references/project-actions.md](references/project-actions.md).

Saving characters or shots resets the stored plan confirmation. Show the meaningful changes; `confirm-plan` records the user's approval. `build-prompt` then combines the saved plan and baseline. A confirmed plan does not independently authorize a new paid video or image request. Preserve consistent seeds and baseline settings where the user wants consistency.

Preserve both `project.shots.sceneMap.environment` (global environment) and each shot's `environment`: time of day, weather, light sources and color palette. Preserve legacy scene/lighting and other sceneMap fields when editing. Report missing-environment or continuity warnings from saving/building prompts; don't silently invent changes from dusk to night. Review includes an `environment` check and requires actual inspection of the output.

Sketch references are optional and default off in the panel's saved image settings. If `build-prompt` offers a nonempty `referenceImage` and the user wants it, pass `sketchReference:{project,shot}` and `mode:'reference'` to `video_generate`; don't also upload the same image or use `sourceId`. The backend resolves the image and rechecks the saved preference and confirmed plan. Do not silently enable this option or infer that it authorizes image generation. A sketch guides composition; inspect the result for environment/color consistency.

`analyze` extracts frames and produces a checklist. Actually inspect the images before submitting `payload.observed`; extraction alone is not semantic validation. `review` records observations; `save-version` archives an existing local clip. `full-video` archives an assembled file; it does not edit or concatenate clips.

Optional `sketch` requires a confirmed plan, an explicitly configured image connection/model, one `shot`, a stable `requestId`, and user authorization for that image. It returns a background job; query `video_job` for `images` and show the paths. Video authorization is not image authorization. Do not imitate an AI storyboard with plotting scripts or silently substitute another image service.

Completed sketches attach to the corresponding shot only while its confirmed plan is unchanged. If the job returns a warning with `attachedToShot:false`, show the saved image and explain that the plan changed; do not claim the old sketch is attached to the current plan.

Project deletion requires explicit user intent. The original DSH host's script interception hooks do not exist in Codex; this skill supplies behavior guidance, not a sandbox claim.
