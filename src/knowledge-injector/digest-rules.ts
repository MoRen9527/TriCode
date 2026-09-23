// ── Digest Rules（digest_rules 正身）──
// LG-035 治理二期一期骨架（六件族三件之一，另两件=digest-classify/digest-executor）：
// digest-rules.yaml 加载 + 确定性 schema 校验。
// 设计锚：docs/execution/hermes-gov-p2-design.md §2② 消化段 / §3 六件族
//（CEO 2026-09-14 18:0x 终批「批，转设计正身」）。
// 零 LLM 纯确定性（R1/R2，CTO 2026-09-24 执行约束）：本件只做声明式规则的
// 解析/校验/匹配原语；判定语义在 digest-classify，执行语义在 digest-executor。
//
// YAML 面=snake_case（设计 §3 示例基线契表：match.source_kind / content_empty /
// action / target_page / depth / escalate_to / reason）；TS 面=camelCase。
// 失败姿态（§3 执行协议）：文件缺失/YAML 解析失败/校验失败 → DigestRulesError
// 列全 issues（不首错即停），绝不静默降级为空规则。

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

/** 阀门三选一（设计 §2②：digest|reject|escalate 三选一，消化段一环）。 */
export type DigestAction = 'digest' | 'reject' | 'escalate';

/** 消化深度：shallow=零 LLM 模板变换；deep=LLM 蒸馏（一期分流 deep-pending，候二期）。 */
export type DigestDepth = 'shallow' | 'deep';

/** 匹配条件：全部声明字段 AND 语义；空对象=catch-all（声明顺序即优先级）。 */
export interface DigestRuleMatch {
  /** source_kind 等值匹配（接入段来源标注字段；单据缺标注 → 不命中）。 */
  sourceKind?: string;
  /** content 空判定（trim 后长度为 0 视为空）。 */
  contentEmpty?: boolean;
}

export interface DigestRule {
  match: DigestRuleMatch;
  action: DigestAction;
  /** action=digest 必填：目标页相对路径模板，支持 {date}/{source_kind} 占位。 */
  targetPage?: string;
  /** action=digest 可选：消化深度，缺省 shallow。 */
  depth?: DigestDepth;
  /** action=escalate 必填：升级目标（设计示例「本席+相关席」）。 */
  escalateTo?: string;
  /** action=reject 建议填：拒绝原因（审计面）。 */
  reason?: string;
}

export interface DigestRules {
  rules: DigestRule[];
}

/** 阀门匹配输入：digest 面最小判定字段（来源=knowledge_documents inbox 文档投影）。 */
export interface DigestRuleInput {
  /** 接入段来源标注（单据缺标注传 undefined/null）。 */
  sourceKind?: string | null;
  content: string;
}

/** 校验/解析失败：issues 列全部问题，绝不静默丢（§3 执行协议）。 */
export class DigestRulesError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`digest-rules 校验失败（${issues.length} 项）:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DigestRulesError';
    this.issues = issues;
  }
}

const ACTIONS: ReadonlySet<string> = new Set(['digest', 'reject', 'escalate']);
const DEPTHS: ReadonlySet<string> = new Set(['shallow', 'deep']);
const RULE_KEYS: ReadonlySet<string> = new Set([
  'match',
  'action',
  'target_page',
  'depth',
  'escalate_to',
  'reason',
]);
const MATCH_KEYS: ReadonlySet<string> = new Set(['source_kind', 'content_empty']);

/** target_page 路径安全：禁绝对路径、禁 `..` 段、禁盘符（防越 outDir 落盘）。 */
export function isSafeTargetPage(targetPage: string): boolean {
  if (targetPage.length === 0) return false;
  if (targetPage.startsWith('/') || /^[A-Za-z]:/.test(targetPage)) return false;
  const segments = targetPage.split(/[\\/]/);
  return !segments.includes('..');
}

/**
 * 校验并归一化 digest 规则（digest_rules 核心）：收集全部 issues 后一次抛出，
 * 单次校验暴露全量问题（修配置不挤牙膏）。
 *
 * @param raw YAML 解析产物（snake_case 形态，见文件头契表）。
 */
export function validateDigestRules(raw: unknown): DigestRules {
  const issues: string[] = [];
  const rules: DigestRule[] = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DigestRulesError(['根节点必须为映射（rules: [...]）']);
  }
  const root = raw as Record<string, unknown>;
  for (const key of Object.keys(root)) {
    if (key !== 'rules') issues.push(`根级未知键: ${key}（仅允许 rules）`);
  }
  if (!Array.isArray(root.rules)) {
    throw new DigestRulesError(['rules 必须为数组']);
  }
  if (root.rules.length === 0) {
    issues.push('rules 不能为空（零规则将使全部单据落入零命中默认）');
  }

  root.rules.forEach((entry, index) => {
    const label = `rules[${index}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      issues.push(`${label} 必须为映射`);
      return;
    }
    const rawRule = entry as Record<string, unknown>;
    for (const key of Object.keys(rawRule)) {
      if (!RULE_KEYS.has(key)) issues.push(`${label} 未知键: ${key}`);
    }

    // match：必填映射，键白名单，值型确定
    const rawMatch = rawRule.match;
    let sourceKind: string | undefined;
    let contentEmpty: boolean | undefined;
    if (typeof rawMatch !== 'object' || rawMatch === null || Array.isArray(rawMatch)) {
      issues.push(`${label}.match 必须为映射`);
    } else {
      const match = rawMatch as Record<string, unknown>;
      for (const key of Object.keys(match)) {
        if (!MATCH_KEYS.has(key)) issues.push(`${label}.match 未知键: ${key}`);
      }
      if ('source_kind' in match) {
        if (typeof match.source_kind !== 'string' || match.source_kind.length === 0) {
          issues.push(`${label}.match.source_kind 必须为非空字符串`);
        } else {
          sourceKind = match.source_kind;
        }
      }
      if ('content_empty' in match) {
        if (typeof match.content_empty !== 'boolean') {
          issues.push(`${label}.match.content_empty 必须为布尔`);
        } else {
          contentEmpty = match.content_empty;
        }
      }
    }

    // action：必填枚举
    const action = rawRule.action;
    if (typeof action !== 'string' || !ACTIONS.has(action)) {
      issues.push(`${label}.action 必须为 digest|reject|escalate 之一`);
      return; // action 非法时后续字段校验失去语义基準，记本条即止
    }

    // 分动必填/可容字段
    let targetPage: string | undefined;
    let depth: DigestDepth | undefined;
    let escalateTo: string | undefined;
    const reason = typeof rawRule.reason === 'string' ? rawRule.reason : undefined;
    if ('reason' in rawRule && typeof rawRule.reason !== 'string') {
      issues.push(`${label}.reason 必须为字符串`);
    }

    if (action === 'digest') {
      if (typeof rawRule.target_page !== 'string' || rawRule.target_page.length === 0) {
        issues.push(`${label}.target_page 必填（action=digest）且为非空字符串`);
      } else {
        targetPage = rawRule.target_page;
        if (!isSafeTargetPage(targetPage)) {
          issues.push(`${label}.target_page 路径不安全（禁绝对路径/.. 越界）: ${targetPage}`);
        }
      }
      if ('depth' in rawRule) {
        if (typeof rawRule.depth !== 'string' || !DEPTHS.has(rawRule.depth)) {
          issues.push(`${label}.depth 必须为 shallow|deep 之一`);
        } else {
          depth = rawRule.depth as DigestDepth;
        }
      }
    } else {
      if ('target_page' in rawRule) issues.push(`${label}.target_page 仅 action=digest 可用`);
      if ('depth' in rawRule) issues.push(`${label}.depth 仅 action=digest 可用`);
    }

    if (action === 'escalate') {
      if (typeof rawRule.escalate_to !== 'string' || rawRule.escalate_to.length === 0) {
        issues.push(`${label}.escalate_to 必填（action=escalate）且为非空字符串`);
      } else {
        escalateTo = rawRule.escalate_to;
      }
    } else if ('escalate_to' in rawRule) {
      issues.push(`${label}.escalate_to 仅 action=escalate 可用`);
    }

    rules.push({ match: { sourceKind, contentEmpty }, action: action as DigestAction, targetPage, depth, escalateTo, reason });
  });

  if (issues.length > 0) {
    throw new DigestRulesError(issues);
  }
  return { rules };
}

/**
 * 从磁盘加载 digest-rules.yaml（digest_rules 入口）：读文件→YAML 解析→校验。
 * 任何失败统一 DigestRulesError（issues 含环节前缀），调用方按配置失败处置。
 */
export function loadDigestRules(path: string): DigestRules {
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DigestRulesError([`规则文件读取/解析失败: ${path}（${message}）`]);
  }
  return validateDigestRules(raw);
}

/**
 * 单规则匹配判定（阀门匹配原语）：全部声明字段 AND 语义；
 * 空匹配对象=catch-all；input.sourceKind 缺失时不命中声明了 source_kind 的规则。
 */
export function matchDigestRule(rule: DigestRule, input: DigestRuleInput): boolean {
  if (rule.match.sourceKind !== undefined && input.sourceKind !== rule.match.sourceKind) {
    return false;
  }
  if (rule.match.contentEmpty !== undefined) {
    const isEmpty = input.content.trim().length === 0;
    if (isEmpty !== rule.match.contentEmpty) return false;
  }
  return true;
}
