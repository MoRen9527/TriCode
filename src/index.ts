// ── TriCode Main Entry ──
// Public API for code task execution.
// CTO-008-P P.2: executeCodeTask / listAvailableTools / getToolStatus.

import type { CodeTaskRequest, CodeTaskResult, CodeTool, CodeToolAdapter, ToolAvailability } from './types.js';
export type { CodeTaskRequest, CodeTaskResult, CodeTool, ToolAvailability };
import { selectTool } from './router.js';
import { OpenCodeAdapter } from './adapters/opencode.js';

// ── Adapter Registry ──
const adapters = new Map<CodeTool, CodeToolAdapter>();

// Tier 1: OpenCode (MVP)
adapters.set('opencode', new OpenCodeAdapter());

// Tier 2-3: pending implementation
// adapters.set('claude', new ClaudeCodeAdapter());
// adapters.set('codex', new CodexAdapter());
// adapters.set('zcode', new ZCodeAdapter());
// adapters.set('copilot', new CopilotAdapter());

/**
 * Execute a code task using the best available tool.
 *
 * If `req.tool` is set to a specific tool, that tool is used directly.
 * If `req.tool` is 'auto' (default), tools are probed in tier order
 * (opencode → claude → codex → zcode → copilot) and the first
 * available one is used.
 */
export async function executeCodeTask(req: CodeTaskRequest): Promise<CodeTaskResult> {
  const selectedTool = await selectTool(req, adapters);

  if (!selectedTool) {
    return {
      tool: 'none',
      success: false,
      output: '',
      error: req.tool && req.tool !== 'auto'
        ? `Tool "${req.tool}" is not registered. Available: ${[...adapters.keys()].join(', ')}`
        : 'No code execution tool is available on this system. Install opencode or another supported tool.',
      durationMs: 0,
    };
  }

  const adapter = adapters.get(selectedTool)!;
  return adapter.execute({ ...req, tool: selectedTool });
}

/**
 * List all registered tool names, regardless of availability.
 */
export function listAvailableTools(): string[] {
  return [...adapters.keys()];
}

/**
 * Check the local availability of a specific tool.
 */
export async function getToolStatus(tool: string): Promise<ToolAvailability> {
  const adapter = adapters.get(tool as CodeTool);
  if (!adapter) return 'unknown';
  return adapter.checkAvailability();
}
