// ── Digest Classify（digest_classify 正身）──
// LG-035 治理二期一期骨架（六件族三件之二）：三选一阀门
//（设计 §2②：阀门=digest|reject|escalate 三选一，消化段一环）。
//
// 语义定谳（CTO 2026-09-24 裁②，随读数件留痕）：
// - 匹配顺序=声明序首匹配（first-match-wins）：规则文件内声明顺序即优先级，
//   与 ACL/声明式规则族惯例同构；
// - 零命中默认 escalate（「待确认不静默丢」§7③ 原则延伸）：
//   未被任何规则覆盖的单据升级本席人工判，不静默丢、不猜测消化。
//
// 零 LLM 纯确定性（R1/R2）：同输入恒同判定。

import { matchDigestRule, type DigestAction, type DigestDepth, type DigestRuleInput, type DigestRules } from './digest-rules.js';

export interface DigestVerdict {
  action: DigestAction;
  /** 命中规则下标；-1 = 零命中默认。 */
  ruleIndex: number;
  targetPage?: string;
  depth?: DigestDepth;
  escalateTo?: string;
  reason?: string;
}

/** 零命中默认升级目标（单据归属席自查；区别于规则显式升级的「本席+相关席」）。 */
export const NO_MATCH_ESCALATE_TO = '本席';

/** 零命中默认原因码（审计面检索键）。 */
export const NO_MATCH_REASON = 'no-rule-matched';

/**
 * 三选一阀门判定：声明序首匹配；零命中 → escalate（no-rule-matched）。
 */
export function classifyDigest(input: DigestRuleInput, rules: DigestRules): DigestVerdict {
  for (let i = 0; i < rules.rules.length; i++) {
    const rule = rules.rules[i];
    if (matchDigestRule(rule, input)) {
      return {
        action: rule.action,
        ruleIndex: i,
        targetPage: rule.targetPage,
        depth: rule.depth,
        escalateTo: rule.escalateTo,
        reason: rule.reason,
      };
    }
  }
  return {
    action: 'escalate',
    ruleIndex: -1,
    escalateTo: NO_MATCH_ESCALATE_TO,
    reason: NO_MATCH_REASON,
  };
}
