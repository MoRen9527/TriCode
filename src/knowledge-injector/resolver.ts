// ── Knowledge Path Resolver（LG-035 注入器架构·提包解耦件）──────────────
//
// knowledge-injector 四件原硬引宿主仓 multi-project-router（TriMLC/TriRLC
// 各自复制体）——提包后改 **resolver 注入**：宿主仓 boot 时 configure 自家
// 实现；缺省 fallback=公式复刻（projectRoot/.tricompany-cognition/knowledge.db
// + 路径包含式隔离），与真源 router 公式逐条对齐（LG-035 认知层落点归一实勘）。
//
// 纪律：宿主仓不 configure 也能跑（fallback 语义=无 projectRoot 单仓形态）；
// 配置了 projectRoot 的多项目形态必须注入宿主 router 实现（隔离语义保真）。

import { join, resolve } from 'node:path';

export interface KnowledgePathResolver {
  getKnowledgeDbPath(projectRoot?: string): string;
  enforceProjectIsolation(projectRoot: string | undefined, dbPath: string): void;
}

let configured: KnowledgePathResolver | null = null;

/** 宿主仓 boot 注入自家 router 实现（ TriMLC/TriRLC 各自调用，一次即可）。 */
export function configureKnowledgePathResolver(resolver: KnowledgePathResolver): void {
  configured = resolver;
}

/** 测试/多实例隔离用（生产链路勿调）。 */
export function resetKnowledgePathResolver(): void {
  configured = null;
}

/** 缺省公式（真源 router resolveProjectPaths knowledge 子集复刻）。 */
function fallbackKnowledgeDbPath(projectRoot?: string): string {
  const root = projectRoot ? resolve(projectRoot) : process.cwd();
  return join(root, '.tricompany-cognition', 'knowledge.db');
}

function fallbackEnforceProjectIsolation(projectRoot: string | undefined, dbPath: string): void {
  if (!projectRoot) return;
  const root = resolve(projectRoot);
  const db = resolve(dbPath);
  if (!db.startsWith(root + '\\') && !db.startsWith(root + '/')) {
    throw new Error(`project isolation violation: ${db} is outside project root ${root}`);
  }
}

/** 四件统一入口：优先宿主注入，缺省 fallback 公式。 */
export function getKnowledgeDbPath(projectRoot?: string): string {
  if (configured) return configured.getKnowledgeDbPath(projectRoot);
  return fallbackKnowledgeDbPath(projectRoot);
}

export function enforceProjectIsolation(projectRoot: string | undefined, dbPath: string): void {
  if (configured) return configured.enforceProjectIsolation(projectRoot, dbPath);
  return fallbackEnforceProjectIsolation(projectRoot, dbPath);
}
