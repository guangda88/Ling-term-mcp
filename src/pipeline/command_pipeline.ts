/**
 * Command Pipeline — Lingyuan V1.0 thin trunk
 *
 * The immutable core of灵犀. Pipeline = middleware chain + forward + onComplete hooks.
 * Adding security rules means adding middleware. Removing rules means removing
 * a .use() call. The trunk never changes.
 */

import type { CommandCtx } from './command_ctx.js';
import type { Middleware, ForwardFn, CompleteHook } from './middleware.js';

export class CommandPipeline {
  private middlewares: Middleware[] = [];
  private forward?: ForwardFn;
  private onCompleteHooks: CompleteHook[] = [];

  use(mw: Middleware): this {
    this.middlewares.push(mw);
    return this;
  }

  setForward(fn: ForwardFn): this {
    this.forward = fn;
    return this;
  }

  onComplete(hook: CompleteHook): this {
    this.onCompleteHooks.push(hook);
    return this;
  }

  async execute(ctx: CommandCtx): Promise<CommandCtx> {
    for (const mw of this.middlewares) {
      ctx = await mw(ctx);
      if (ctx.rejected) return ctx;
    }
    if (!this.forward) {
      ctx.reject('Pipeline has no forward executor', 'internal');
      return ctx;
    }
    ctx = await this.forward(ctx);
    for (const hook of this.onCompleteHooks) {
      await hook(ctx);
    }
    return ctx;
  }
}

/**
 * Build the standard灵犀 pipeline.
 * This is a branch — pluggable, configurable, replaceable.
 * The thin trunk (CommandPipeline class) never changes.
 */
export function buildDefaultPipeline(): CommandPipeline {
  // Middleware imports are deferred to avoid circular deps.
  // Concrete build happens in pipeline_factory.ts.
  throw new Error('buildDefaultPipeline moved to pipeline_factory.ts');
}
