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

// ── Knowledge Injector（LG-035 注入器架构·单提共用位）──
export {
  knowledgeContextTag,
  buildKnowledgeContextBlock,
  injectKnowledgeContext,
  type KnowledgeInjectionResult,
} from './knowledge-injector/inject.js';
export {
  createKnowledgeStore,
  KNOWLEDGE_LAYERS,
  layerDomain,
  type KnowledgeLayer,
  type KnowledgeLayerDomain,
  type KnowledgeNamespace,
  type KnowledgeMetricEvent,
} from './knowledge-injector/knowledge-db.js';
export {
  KNOWLEDGE_LAYER_FILE_SUFFIXES,
  CONTENT_SUPPORT_ROOT_NAME,
  resolveContentRoot,
  INBOX_RECORD_FIELDS,
  INBOX_CLOSED_WINDOW_DAYS,
  parseInboxRecord,
  shouldInjectInboxRecord,
  serializeInboxContent,
  syncKnowledgeFromSource,
  type InboxRecord,
  type KnowledgeSyncReport,
} from './knowledge-injector/sync.js';
export {
  recordKnowledgeMetric,
  getKnowledgeMetricSnapshot,
  isEscalationBlockReason,
  type KnowledgeMetricInput,
  type KnowledgeMetricSnapshot,
} from './knowledge-injector/metrics.js';
export {
  configureKnowledgePathResolver,
  resetKnowledgePathResolver,
  getKnowledgeDbPath,
  enforceProjectIsolation,
  getKnowledgeDbPath as getKitKnowledgeDbPath,
  enforceProjectIsolation as enforceKitProjectIsolation,
  type KnowledgePathResolver,
} from './knowledge-injector/resolver.js';
