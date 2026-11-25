import { createRequire } from 'node:module';
import { PLATFORM_ROOT } from '../../platforms/codex-plugin/server/util.mjs';

// Keep Codex build/test dependencies isolated from DSH's host peer dependencies.
const require = createRequire(PLATFORM_ROOT + '/package.json');
export const { build } = require('esbuild');
export const { chromium } = require('playwright-core');
export const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
export const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
