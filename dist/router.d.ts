import type { CodeTaskRequest, CodeTool, CodeToolAdapter } from './types.js';
/**
 * Select the best available tool for a given request.
 * If `tool` is specified and not 'auto', returns it directly (caller validates availability).
 * If 'auto', probes adapters in tier order and returns the first available one.
 */
export declare function selectTool(req: CodeTaskRequest, adapters: Map<CodeTool, CodeToolAdapter>): Promise<CodeTool | null>;
//# sourceMappingURL=router.d.ts.map