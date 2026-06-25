/**
 * Middleware Interface
 * A middleware transforms CommandCtx, may reject, or continue the pipeline
 */

import type { CommandCtx } from './command_ctx.js';

export type Middleware = (ctx: CommandCtx) => Promise<CommandCtx> | CommandCtx;

export type ForwardFn = (ctx: CommandCtx) => Promise<CommandCtx>;

export type CompleteHook = (ctx: CommandCtx) => Promise<void> | void;
