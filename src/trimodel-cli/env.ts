// ── trimodel-cli core · L-C 环境解析层 + CoreIO 注入点（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// 设计正身=FSD 波③ core 导出面接口清单 r2（TMV 68f64c9e）§1 L-C/§2；CTO 三点施工批复已织入。
// core 零仓感知：一切仓特有项经 CoreIO 由 bin 侧给；缺省解析器随 core 走（env 兜底，可覆写）。

import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

// ── 环境变量族（四族命令与 HTTP 壳同读；单键全局，禁族形拆分——CTO 裁③ 四个可漂移面）──
export const SETTINGS_FILE_ENV = 'TRIMODEL_CLAUDE_SETTINGS';
export const DEPLOY_KEY_ENV = 'TRIMODEL_DEPLOY_KEY';
export const AUDIT_LOG_ENV = 'TRIMODEL_AUDIT_LOG';
/** L2 恢复梯标记文件（status 读数源；未设=不读=CLI status 无 l2 段——core 零硬编码路径，
 * 路径真源=调度环境注入，波④前置小笔① 2026-09-26 CTO 批接）。 */
export const L2_FLAG_ENV = 'TRIMODEL_L2_FLAG';
/** CTO 裁③（施工批复①同族）：默认 provider 单键全局，四族同读；缺省常量 bigmodel。 */
export const DEFAULT_PROVIDER_ENV = 'TRIMODEL_CLI_DEFAULT_PROVIDER';

/** 零参数安全侧默认 provider（派工单范围⑨；joint-plan 问3「零参数=安全侧默认」）。 */
export const DEFAULT_PROVIDER = 'bigmodel';

/** env 覆写一档：TRIMODEL_CLI_DEFAULT_PROVIDER 有值且非空→用之；否则常量 bigmodel。 */
export function resolveDefaultProvider(): string {
  const env = process.env[DEFAULT_PROVIDER_ENV]?.trim();
  return env ? env : DEFAULT_PROVIDER;
}

/** 写入目标缺省解析（现役形态逐字等价：env 钉位 → ~/.claude/settings.json）。 */
export function defaultSettingsPath(): string {
  const env = process.env[SETTINGS_FILE_ENV]?.trim();
  if (env) return env;
  return join(homedir(), '.claude', 'settings.json');
}

export interface DeployKeyResolution {
  path: string;
  /** per-provider=新命名族；legacy=无后缀旧部署位（现役落位兼容，零迁移过渡）；env=显式钉位。 */
  source: 'env' | 'per-provider' | 'legacy';
}

/**
 * 独立钥文件缺省解析（fail-closed：缺失/空=拒写不猜；钥源序照 ps1 修-2 同族）。
 * 序：env 钉位（现役全局形态，兼容保留）→ per-provider `.deploy-key.<provider>`（派工单范围⑤）
 * → legacy 无后缀 `.deploy-key`（部署日已落位文件，LG-053 供钥留痕；零迁移过渡）。
 * 文件存在性检查仅 legacy 回退需要（前两级路径直返，缺失由 readDeployKey fail-closed 报）。
 */
export function defaultDeployKeyPath(provider: string): DeployKeyResolution {
  const env = process.env[DEPLOY_KEY_ENV]?.trim();
  if (env) return { path: env, source: 'env' };
  const base = join(homedir(), '.claude', 'settings.presets');
  const perProvider = join(base, `.deploy-key.${provider}`);
  if (existsSafe(perProvider)) return { path: perProvider, source: 'per-provider' };
  const legacy = join(base, '.deploy-key');
  if (existsSafe(legacy)) return { path: legacy, source: 'legacy' };
  // 两级都不存在：指 per-provider 路径（新命名族为正位，报缺失引导落位）
  return { path: perProvider, source: 'per-provider' };
}

function existsSafe(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

/** 审计行落点缺省解析（现役形态等价：env → cwd/config-audit.log）。 */
export function defaultAuditLogPath(): string {
  const env = process.env[AUDIT_LOG_ENV]?.trim();
  if (env) return env;
  return join(process.cwd(), 'config-audit.log');
}

/** L2 标记文件路径缺省解析（env 未设=undefined=status 无 l2 段，诚实未接线态）。 */
export function defaultL2FlagPath(): string | undefined {
  const env = process.env[L2_FLAG_ENV]?.trim();
  return env || undefined;
}

/** presets 唯一真源目录（core 包内自洽：src 或 dist 同构 ../../presets；CTO 裁③ 引用形态）。 */
export function defaultPresetsDir(): string {
  // src/trimodel-cli/env.ts → ../../presets = <pkg>/presets
  // dist/trimodel-cli/env.js → ../../presets = <pkg>/presets（rootDir=src 同构投影）
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'presets');
}

// ── CoreIO：bin 侧唯一需要构造的东西（core 零仓感知单点落点）──

/** 实时探活读数（CTO 裁①：回调型注入；status 需实时探活，日志 tail 只配探针失败辅显）。 */
export interface ProbeReading {
  up: boolean;
  detail?: string;
  latencyMs?: number;
}

export interface CoreIO {
  /** 写入目标（必注入；缺省=defaultSettingsPath()）。 */
  settingsPath: string;
  /** presets 唯一真源目录（缺省=defaultPresetsDir() 包内）。 */
  presetsDir: string;
  /** 独立钥文件路径 per-provider（缺省=defaultDeployKeyPath 序）。 */
  deployKeyPathFor: (provider: string) => DeployKeyResolution;
  /** 结构化审计行落点（缺省=defaultAuditLogPath()）。 */
  auditLogPath: string;
  /** 审计调用方标识（'trimlc-cmd' | 'trirlc-cmd' | 'trimmc-cmd' | 'trirmc-cmd' | 'ui-restore' | …）。 */
  who: string;
  /** 四象限路由键（问6；本机 M/R 分族注入；服务域=sg/heyuan）。 */
  machine?: string;
  /** 实时探活回调族（bin 按域注入 health+keys 值面 fetch；core 零端点知识）。 */
  probes?: Array<{ name: string; probe: () => Promise<ProbeReading> }>;
  /** L2 标记态读数源（status 用；缺省零标记态）。 */
  l2FlagPath?: string;
  /** 零参数默认 provider（缺省=env 单键全局→常量 bigmodel）。 */
  defaultProvider?: string;
  /** 帮助文本显示用 bin 名（如 'trimlc'；缺省 'trimodel'）。 */
  binName?: string;
}

/** 缺省装配器：bin 只给差异项，其余 env 解析器兜底（四族 bin 薄包装的关键减负件）。
 * who 必给（审计调用方标识，门⑤ 落行字段——缺省即审计失明，类型面强制）。 */
export function makeCoreIO(partial: Partial<CoreIO> & { who: string }): CoreIO {
  return {
    settingsPath: partial.settingsPath ?? defaultSettingsPath(),
    presetsDir: partial.presetsDir ?? defaultPresetsDir(),
    deployKeyPathFor: partial.deployKeyPathFor
      ?? ((provider: string) => defaultDeployKeyPath(provider)),
    auditLogPath: partial.auditLogPath ?? defaultAuditLogPath(),
    who: partial.who,
    machine: partial.machine,
    probes: partial.probes,
    l2FlagPath: partial.l2FlagPath,
    defaultProvider: partial.defaultProvider ?? resolveDefaultProvider(),
    binName: partial.binName,
  };
}

/** 结构化审计行（门⑤）：`AUDIT | <ts> | who=.. | mode=.. | …`——钥值全程不进日志；
 * append-only，写失败不阻塞主流程。形态与现役逐字兼容（L2 接线与事后取证同源）。 */
export function appendAudit(auditLogPath: string, fields: Record<string, string>): void {
  try {
    const line = 'AUDIT | ' + new Date().toISOString() + ' | ' + Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' | ');
    mkdirSync(dirname(auditLogPath), { recursive: true });
    writeFileSync(auditLogPath, line + '\n', { flag: 'a', encoding: 'utf-8' });
  } catch { /* 审计失败不阻塞主流程（主流程自带结构化结果行兜底） */ }
}
