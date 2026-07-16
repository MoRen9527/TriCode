import type { CodeTaskRequest, CodeTaskResult, CodeTool, ToolAvailability } from './types.js';
export type { CodeTaskRequest, CodeTaskResult, CodeTool, ToolAvailability };
/**
 * Execute a code task using the best available tool.
 *
 * If `req.tool` is set to a specific tool, that tool is used directly.
 * If `req.tool` is 'auto' (default), tools are probed in tier order
 * (opencode → claude → codex → zcode → copilot) and the first
 * available one is used.
 */
export declare function executeCodeTask(req: CodeTaskRequest): Promise<CodeTaskResult>;
/**
 * List all registered tool names, regardless of availability.
 */
export declare function listAvailableTools(): string[];
/**
 * Check the local availability of a specific tool.
 */
export declare function getToolStatus(tool: string): Promise<ToolAvailability>;
//# sourceMappingURL=index.d.ts.map