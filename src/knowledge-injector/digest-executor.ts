// ── Digest Executor（digest_executor 正身）──
// LG-035 治理二期一期骨架（六件族三件之三）：消化执行
//（设计 §2③ 输出段 / §3 执行协议）。
//
// 深度分级（CTO 2026-09-24 裁④）：
// - shallow=确定性模板变换（零 LLM，R1/R2）——同输入恒同输出（字节级）；
// - deep=确定性分流 deep-pending 队列项（不调模型、不静默丢），深蒸馏候二期。
//
// 幂等=content_hash 延伸（§3 执行协议）：页头 digest_of 记录源 hash；
// 同源固定时间戳重消化 → 页字节级一致（确定性锚，测试覆盖）。
// 失败姿态：写盘/路径异常 → error outcome（绝不静默丢），不抛出中断链路。
//
// 边界：注入页编译五段（摘要/事实/判断/待确认/来源）属 digest_render 域
//（六件族第四件，非一期）——本件产出=shallow 模板草稿页（working 态），
// render 期接手编译；本件不触 knowledge.db（digest_log/registry 亦非一期）。

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { DigestVerdict } from './digest-classify.js';

export interface DigestDocumentInput {
  agentId: string;
  sourceKind?: string | null;
  content: string;
  /** SHA-256（knowledge_documents.content_hash 同源投影）。 */
  contentHash: string;
  sourcePath?: string | null;
}

export type DigestOutcome =
  | { status: 'digested'; pagePath: string; page: string; contentHash: string }
  | { status: 'deep-pending'; queuePath: string; contentHash: string; reason: string }
  // reject 日志持久化=digest_log 件职责（设计 §7②「丢弃有日志」；一期仅结构化
  // outcome，digest_log 随二期排期显式带上——STE 防语义悬空注记 2026-09-24）。
  | { status: 'rejected'; contentHash: string; reason: string }
  | { status: 'escalated'; contentHash: string; escalateTo: string; reason?: string }
  | { status: 'error'; contentHash: string; reason: string };

export interface ExecuteDigestOptions {
  /** 注入页输出根目录（target_page 相对此目录解析）。 */
  outDir: string;
  /** deep 分流队列文件名（outDir 下），缺省 'deep-pending.jsonl'。 */
  deepQueueFile?: string;
  /** ISO 时刻（缺省系统钟；测试注入固定值保字节级确定性）。 */
  now?: string;
}

/** 页头/队列行的统一时刻格式：ISO 8601（UTC）。 */
function isoNow(now?: string): string {
  return now ?? new Date().toISOString();
}

/** {date} 占位：ISO 时刻 → YYYY-MM-DD（UTC 日界，确定性）。 */
function dateToken(nowIso: string): string {
  return nowIso.slice(0, 10);
}

/** target_page 模板展开：{date}/{source_kind} 两占位（确定性替换）。 */
export function resolveTargetPage(template: string, doc: DigestDocumentInput, nowIso: string): string {
  return template
    .replaceAll('{date}', dateToken(nowIso))
    .replaceAll('{source_kind}', doc.sourceKind ?? 'unknown');
}

/** 页题：首非空行 ≤80 字符取之，否则「（无题）」（确定性规则）。 */
function pageTitle(content: string): string {
  const firstLine = content.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
  if (firstLine && firstLine.length <= 80) return firstLine;
  return '（无题）';
}

/** shallow 页模板（working 态草稿；编译五段候 digest_render 期）。 */
export function renderShallowPage(doc: DigestDocumentInput, depth: 'shallow' | 'deep', nowIso: string): string {
  const title = pageTitle(doc.content);
  const body = doc.content.trim();
  return [
    '---',
    `source_kind: ${doc.sourceKind ?? 'unknown'}`,
    `agent: ${doc.agentId}`,
    `digest_of: ${doc.contentHash}`,
    `depth: ${depth}`,
    'status: working',
    `generated_at: ${nowIso}`,
    '---',
    '',
    `# ${title}`,
    '',
    body,
    '',
    '## 来源',
    `- 源: ${doc.sourcePath ?? '（未记录）'}`,
    '- 消化: digest_executor shallow 模板变换（零 LLM）',
    '',
  ].join('\n');
}

/** 越界防护二次校验（validator 同规则，纵深防御）：返回 null=安全，否则=拒绝理由。 */
function unsafeTargetReason(pagePath: string, outDir: string): string | null {
  const relFromOut = relative(resolve(outDir), resolve(pagePath));
  if (relFromOut === '' || relFromOut.startsWith('..') || isAbsolute(relFromOut)) {
    return `target_page 越出输出根目录: ${pagePath}`;
  }
  return null;
}

function writeShallowPage(doc: DigestDocumentInput, verdict: DigestVerdict, opts: ExecuteDigestOptions): DigestOutcome {
  const nowIso = isoNow(opts.now);
  try {
    const template = verdict.targetPage;
    if (!template) {
      return { status: 'error', contentHash: doc.contentHash, reason: 'digest 判定缺 target_page（规则校验漏网）' };
    }
    const rel = resolveTargetPage(template, doc, nowIso);
    if (isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
      return { status: 'error', contentHash: doc.contentHash, reason: `target_page 路径不安全: ${template}` };
    }
    const pagePath = join(resolve(opts.outDir), rel);
    const unsafe = unsafeTargetReason(pagePath, opts.outDir);
    if (unsafe) {
      return { status: 'error', contentHash: doc.contentHash, reason: unsafe };
    }
    const page = renderShallowPage(doc, 'shallow', nowIso);
    mkdirSync(dirname(pagePath), { recursive: true });
    writeFileSync(pagePath, page, 'utf8');
    return { status: 'digested', pagePath, page, contentHash: doc.contentHash };
  } catch (err) {
    return { status: 'error', contentHash: doc.contentHash, reason: `写盘失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function dispatchDeepPending(doc: DigestDocumentInput, verdict: DigestVerdict, opts: ExecuteDigestOptions): DigestOutcome {
  const nowIso = isoNow(opts.now);
  try {
    mkdirSync(resolve(opts.outDir), { recursive: true });
    const queuePath = join(resolve(opts.outDir), opts.deepQueueFile ?? 'deep-pending.jsonl');
    const entry = {
      contentHash: doc.contentHash,
      agentId: doc.agentId,
      sourceKind: doc.sourceKind ?? null,
      sourcePath: doc.sourcePath ?? null,
      reason: verdict.reason ?? 'depth=deep（一期零 LLM 分流，深蒸馏候二期）',
      queuedAt: nowIso,
    };
    appendFileSync(queuePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return {
      status: 'deep-pending',
      queuePath,
      contentHash: doc.contentHash,
      reason: entry.reason,
    };
  } catch (err) {
    return { status: 'error', contentHash: doc.contentHash, reason: `deep 队列写盘失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * 消化执行入口：按阀门判定分发（digest→shallow 页落盘/deep→队列分流；
 * reject/escalate→结构化 outcome 交调用方审计，本件不落盘——reject 日志面
 * =digest_log 二期件，设计 §7② 依赖显式化）。
 * 全路径零 LLM；error outcome 绝不静默丢（调用方审计面处置）。
 */
export function executeDigest(doc: DigestDocumentInput, verdict: DigestVerdict, opts: ExecuteDigestOptions): DigestOutcome {
  switch (verdict.action) {
    case 'digest':
      return verdict.depth === 'deep'
        ? dispatchDeepPending(doc, verdict, opts)
        : writeShallowPage(doc, verdict, opts);
    case 'reject':
      return { status: 'rejected', contentHash: doc.contentHash, reason: verdict.reason ?? 'unspecified' };
    case 'escalate':
      return { status: 'escalated', contentHash: doc.contentHash, escalateTo: verdict.escalateTo ?? '本席', reason: verdict.reason };
  }
}
