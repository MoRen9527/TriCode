// ── TriCode Tool Router ──
// Selects the best available tool based on tier priority and availability.
// CTO-008-P P.2: Tier 1 (opencode) → Tier 2 (Claude Code) → Tier 3 (Codex/zcode/Copilot).

import type { CodeTaskRequest, CodeTool, CodeToolAdapter, ToolAvailability } from './types.js';

/** Ordered priority of tools for auto-selection. */
const TOOL_TIERS: CodeTool[] = ['opencode', 'claude', 'codex', 'zcode', 'copilot'];

/**
 * Select the best available tool for a given request.
 * If `tool` is specified and not 'auto', returns it directly (caller validates availability).
 * If 'auto', probes adapters in tier order and returns the first available one.
 */
export async function selectTool(
  req: CodeTaskRequest,
  adapters: Map<CodeTool, CodeToolAdapter>,
): Promise<CodeTool | null> {
  // Explicit tool selection
  if (req.tool && req.tool !== 'auto') {
    return req.tool;
  }

  // Auto-selection: probe in tier order
  for (const tool of TOOL_TIERS) {
    const adapter = adapters.get(tool);
    if (!adapter) continue;

    const available = await adapter.checkAvailability();
    if (available === 'available') return tool;
  }

  return null;
}
