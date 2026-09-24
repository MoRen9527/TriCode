// ── Digest 骨架三件测试 ──
// LG-035 治理二期一期（digest_rules / digest_classify / digest_executor）。
// 覆盖面：
//   1. digest_rules：snake_case 契表解析 + 确定性 schema 校验（issues 全量收集）
//   2. digest_classify：声明序首匹配 + 零命中默认 escalate（no-rule-matched）
//   3. digest_executor：shallow 确定性落盘（字节级复现）/ deep-pending 队列分流 /
//      reject·escalate 结构化 outcome / 路径越界 error
//   4. 端到端最小消化链路（fade-010 整改①锚）：磁盘 yaml → 加载 → 分类 → 执行 →
//      落盘断言（真文件全链路，非 mock）
// 零 LLM 纯确定性（R1/R2）：全部断言确定性（时间戳注入固定值）。

import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DigestRulesError,
  isSafeTargetPage,
  loadDigestRules,
  matchDigestRule,
  validateDigestRules,
} from '../src/knowledge-injector/digest-rules.js';
import { classifyDigest } from '../src/knowledge-injector/digest-classify.js';
import { executeDigest, renderShallowPage } from '../src/knowledge-injector/digest-executor.js';

// 设计 §3 示例基线（顺序勘正：content_empty reject 置首——声明序首匹配语义下
// 置尾会被 source_kind 规则遮蔽；勘正观察项随读数件报 CTO）+ deep 分流一条。
const BASELINE_YAML = `rules:
  - match: { content_empty: true }
    action: reject
    reason: 空内容
  - match: { source_kind: daily-note }
    action: digest
    target_page: "工作日志/{date}.md"
    depth: shallow
  - match: { source_kind: decision-record }
    action: escalate
    escalate_to: 本席+相关席
  - match: { source_kind: research-note }
    action: digest
    target_page: "深读/{date}.md"
    depth: deep
`;

const NOW = '2026-09-24T03:30:00.000Z';
const NOW_DATE = '2026-09-24';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'digest-chain-'));
}

function doc(overrides: Partial<{ agentId: string; sourceKind: string | null; content: string; sourcePath: string | null }> = {}) {
  const content = overrides.content ?? '今日完成 digest 骨架三件。';
  return {
    agentId: overrides.agentId ?? 'm-fsd',
    sourceKind: overrides.sourceKind !== undefined ? overrides.sourceKind : 'daily-note',
    content,
    contentHash: sha256(content),
    sourcePath: overrides.sourcePath !== undefined ? overrides.sourcePath : '/inbox/2026-09-24.md',
  };
}

// ── 1. digest_rules ──

test('rules 基线解析：snake_case 契表 → camelCase 规则', () => {
  const rules = validateDigestRules({
    rules: [
      { match: { content_empty: true }, action: 'reject', reason: '空内容' },
      { match: { source_kind: 'daily-note' }, action: 'digest', target_page: '工作日志/{date}', depth: 'shallow' },
      { match: { source_kind: 'decision-record' }, action: 'escalate', escalate_to: '本席+相关席' },
    ],
  });
  assert.equal(rules.rules.length, 3);
  const [r0, r1, r2] = rules.rules;
  assert.deepEqual(r0.match, { sourceKind: undefined, contentEmpty: true });
  assert.equal(r0.action, 'reject');
  assert.equal(r1.match.sourceKind, 'daily-note');
  assert.equal(r1.targetPage, '工作日志/{date}');
  assert.equal(r1.depth, 'shallow');
  assert.equal(r2.escalateTo, '本席+相关席');
});

test('rules 校验：issues 全量收集一次抛出', () => {
  assert.throws(
    () =>
      validateDigestRules({
        rules: [
          { match: { source_kind: 42 }, action: 'nope' },
          { match: { source_kind: 'a' }, action: 'digest' },
          { match: { source_kind: 'b' }, action: 'escalate' },
          { match: { source_kind: 'c' }, action: 'reject', depth: 'shallow' },
          { match: { bogus_key: true }, action: 'reject' },
        ],
      }),
    (err: unknown) => {
      assert.ok(err instanceof DigestRulesError);
      const issues = (err as DigestRulesError).issues;
      assert.ok(issues.some((i) => i.includes('action')), '含 action 枚举 issue');
      assert.ok(issues.some((i) => i.includes('target_page')), '含 digest 缺 target_page issue');
      assert.ok(issues.some((i) => i.includes('escalate_to')), '含 escalate 缺 escalate_to issue');
      assert.ok(issues.some((i) => i.includes('depth 仅 action=digest')), '含 depth 误用 issue');
      assert.ok(issues.some((i) => i.includes('bogus_key')), '含未知 match 键 issue');
      assert.ok(issues.length >= 5, `issues 应全量收集（实得 ${issues.length}）`);
      return true;
    },
  );
});

test('rules 校验：空规则集/未知根键/根型错误', () => {
  assert.throws(() => validateDigestRules({ rules: [] }), (err: unknown) => {
    assert.ok(err instanceof DigestRulesError);
    assert.ok((err as DigestRulesError).issues.some((i) => i.includes('不能为空')));
    return true;
  });
  assert.throws(() => validateDigestRules({ bogus: 1, rules: [{ match: {}, action: 'reject' }] }), (err: unknown) => {
    assert.ok(err instanceof DigestRulesError);
    assert.ok((err as DigestRulesError).issues.some((i) => i.includes('根级未知键')));
    return true;
  });
  assert.throws(() => validateDigestRules(null), DigestRulesError);
  assert.throws(() => validateDigestRules('rules: []'), DigestRulesError);
});

test('rules 校验：target_page 路径安全', () => {
  assert.ok(isSafeTargetPage('工作日志/2026-09-24.md'));
  assert.ok(isSafeTargetPage('a\\b\\c.md'));
  assert.ok(!isSafeTargetPage('../escape.md'));
  assert.ok(!isSafeTargetPage('a/../../escape.md'));
  assert.ok(!isSafeTargetPage('/absolute.md'));
  assert.ok(!isSafeTargetPage('C:/absolute.md'));
  assert.ok(!isSafeTargetPage(''));
  assert.throws(
    () => validateDigestRules({ rules: [{ match: {}, action: 'digest', target_page: '../escape.md' }] }),
    (err: unknown) => {
      assert.ok(err instanceof DigestRulesError);
      assert.ok((err as DigestRulesError).issues.some((i) => i.includes('路径不安全')));
      return true;
    },
  );
});

test('rules 加载：磁盘 yaml 全链 + 缺文件报错', () => {
  const dir = makeTempDir();
  const path = join(dir, 'digest-rules.yaml');
  writeFileSync(path, BASELINE_YAML, 'utf8');
  const rules = loadDigestRules(path);
  assert.equal(rules.rules.length, 4);

  assert.throws(() => loadDigestRules(join(dir, 'missing.yaml')), (err: unknown) => {
    assert.ok(err instanceof DigestRulesError);
    assert.ok((err as DigestRulesError).issues[0].includes('读取/解析失败'));
    return true;
  });
});

// ── 2. digest_classify ──

function rulesFromYaml(yaml: string) {
  const dir = makeTempDir();
  const path = join(dir, 'digest-rules.yaml');
  writeFileSync(path, yaml, 'utf8');
  return loadDigestRules(path);
}

test('classify：声明序首匹配（content_empty 置首遮蔽 source_kind）', () => {
  const rules = rulesFromYaml(BASELINE_YAML);
  const verdict = classifyDigest({ sourceKind: 'daily-note', content: '   ' }, rules);
  assert.deepEqual(
    { action: verdict.action, ruleIndex: verdict.ruleIndex, reason: verdict.reason },
    { action: 'reject', ruleIndex: 0, reason: '空内容' },
  );
});

test('classify：digest / escalate / 零命中默认三分支', () => {
  const rules = rulesFromYaml(BASELINE_YAML);

  const digested = classifyDigest({ sourceKind: 'daily-note', content: '有内容' }, rules);
  assert.equal(digested.action, 'digest');
  assert.equal(digested.ruleIndex, 1);
  assert.equal(digested.depth, 'shallow');

  const escalated = classifyDigest({ sourceKind: 'decision-record', content: '裁决事项' }, rules);
  assert.equal(escalated.action, 'escalate');
  assert.equal(escalated.escalateTo, '本席+相关席');

  const zeroMatch = classifyDigest({ sourceKind: 'unknown-kind', content: '未分类' }, rules);
  assert.deepEqual(
    { action: zeroMatch.action, ruleIndex: zeroMatch.ruleIndex, escalateTo: zeroMatch.escalateTo, reason: zeroMatch.reason },
    { action: 'escalate', ruleIndex: -1, escalateTo: '本席', reason: 'no-rule-matched' },
  );
});

test('classify：catch-all 空匹配 + 确定性复现', () => {
  const rules = rulesFromYaml('rules:\n  - match: {}\n    action: reject\n    reason: 全拒\n');
  const v1 = classifyDigest({ sourceKind: 'anything', content: 'x' }, rules);
  const v2 = classifyDigest({ sourceKind: null, content: 'y' }, rules);
  assert.equal(v1.action, 'reject');
  assert.deepEqual(v1, v2);
});

test('match 原语：source_kind 缺标注不命中声明规则', () => {
  const rule = { match: { sourceKind: 'daily-note', contentEmpty: undefined }, action: 'digest' as const };
  assert.equal(matchDigestRule(rule, { sourceKind: null, content: 'x' }), false);
  assert.equal(matchDigestRule(rule, { sourceKind: 'daily-note', content: 'x' }), true);
});

// ── 3. digest_executor ──

test('executor：shallow 页落盘 + {date} 展开 + 字节级确定性', () => {
  const outDir = makeTempDir();
  const d = doc();
  const rules = rulesFromYaml(BASELINE_YAML);
  const verdict = classifyDigest({ sourceKind: d.sourceKind, content: d.content }, rules);

  const o1 = executeDigest(d, verdict, { outDir, now: NOW });
  assert.equal(o1.status, 'digested');
  if (o1.status !== 'digested') return; // narrowing
  const expectedPath = join(outDir, '工作日志', `${NOW_DATE}.md`);
  assert.equal(o1.pagePath, expectedPath);
  const bytes1 = readFileSync(expectedPath, 'utf8');
  assert.equal(o1.page, bytes1);
  assert.ok(bytes1.includes(`digest_of: ${d.contentHash}`));
  assert.ok(bytes1.includes('source_kind: daily-note'));
  assert.ok(bytes1.includes('status: working'));
  assert.ok(bytes1.includes('# 今日完成 digest 骨架三件。'));

  // 同输入（固定 now）重消化 → 字节级一致（确定性锚）
  executeDigest(d, verdict, { outDir, now: NOW });
  assert.equal(readFileSync(expectedPath, 'utf8'), bytes1);
});

test('executor：deep 分流 deep-pending 队列（不落页）', () => {
  const outDir = makeTempDir();
  const d = doc({ sourceKind: 'research-note', content: '深读材料' });
  const rules = rulesFromYaml(BASELINE_YAML);
  const verdict = classifyDigest({ sourceKind: d.sourceKind, content: d.content }, rules);
  assert.equal(verdict.depth, 'deep');

  const o = executeDigest(d, verdict, { outDir, now: NOW });
  assert.equal(o.status, 'deep-pending');
  if (o.status !== 'deep-pending') return;
  const line = readFileSync(o.queuePath, 'utf8').trim();
  const entry = JSON.parse(line) as { contentHash: string; sourceKind: string; queuedAt: string };
  assert.equal(entry.contentHash, d.contentHash);
  assert.equal(entry.sourceKind, 'research-note');
  assert.equal(entry.queuedAt, NOW);
  // 不落页：outDir 下仅队列文件
  assert.deepEqual(readdirSync(outDir), ['deep-pending.jsonl']);
});

test('executor：reject / escalate 结构化 outcome（零落盘）', () => {
  const outDir = makeTempDir();
  const rules = rulesFromYaml(BASELINE_YAML);

  const rejected = executeDigest(doc({ content: '  ' }), classifyDigest({ sourceKind: 'daily-note', content: '  ' }, rules), { outDir, now: NOW });
  if (rejected.status !== 'rejected') return assert.fail(`期望 rejected，实得 ${rejected.status}`);
  assert.equal(rejected.reason, '空内容');

  const escalated = executeDigest(
    doc({ sourceKind: 'decision-record' }),
    classifyDigest({ sourceKind: 'decision-record', content: 'x' }, rules),
    { outDir, now: NOW },
  );
  assert.equal(escalated.status, 'escalated');
  if (escalated.status !== 'escalated') return;
  assert.equal(escalated.escalateTo, '本席+相关席');

  assert.deepEqual(readdirSync(outDir), [], 'reject/escalate 不落盘（输出目录保持空）');
});

test('executor：越界 target_page → error outcome（不抛不落盘）', () => {
  const outDir = makeTempDir();
  const d = doc();
  const craftedVerdict = { action: 'digest' as const, ruleIndex: 0, targetPage: '../escape.md', depth: 'shallow' as const };
  const o = executeDigest(d, craftedVerdict, { outDir, now: NOW });
  assert.equal(o.status, 'error');
  if (o.status !== 'error') return;
  assert.ok(o.reason.includes('不安全') || o.reason.includes('越出'));
  assert.equal(existsSync(join(outDir, '..', 'escape.md')), false);
});

// ── 4. 端到端最小消化链路（真文件全链路）──

test('端到端：磁盘 yaml → 加载 → 分类 → 执行 → 落盘（四判定全走）', () => {
  const workDir = makeTempDir();
  const rulesPath = join(workDir, 'digest-rules.yaml');
  const outDir = join(workDir, 'pages');
  writeFileSync(rulesPath, BASELINE_YAML, 'utf8');

  const rules = loadDigestRules(rulesPath);
  const run = (sourceKind: string | null, content: string) => {
    const d = doc({ sourceKind, content });
    const verdict = classifyDigest({ sourceKind, content }, rules);
    return { d, outcome: executeDigest(d, verdict, { outDir, now: NOW }) };
  };

  const r1 = run('daily-note', '日常笔记内容');
  const r2 = run('decision-record', '决策记录内容');
  const r3 = run('daily-note', '   ');
  const r4 = run('research-note', '研究材料内容');
  const r5 = run('mystery-kind', '未分类内容');

  assert.equal(r1.outcome.status, 'digested');
  assert.equal(r2.outcome.status, 'escalated');
  assert.equal(r3.outcome.status, 'rejected');
  assert.equal(r4.outcome.status, 'deep-pending');
  assert.equal(r5.outcome.status, 'escalated');
  if (r5.outcome.status !== 'escalated') return;
  assert.equal(r5.outcome.reason, 'no-rule-matched');

  // 落盘实勘：页文件在、deep 队列一行、内容含来源标注
  const pageBytes = readFileSync(join(outDir, '工作日志', `${NOW_DATE}.md`), 'utf8');
  assert.ok(pageBytes.includes('日常笔记内容'));
  assert.ok(pageBytes.includes('## 来源'));
  const queueLines = readFileSync(join(outDir, 'deep-pending.jsonl'), 'utf8').trim().split('\n');
  assert.equal(queueLines.length, 1);
  assert.equal((JSON.parse(queueLines[0]) as { contentHash: string }).contentHash, r4.d.contentHash);
});

// ── 5. 一期验收候项补测（STE 门 gap g1-g3，2026-09-24 排窗随手补）──

test('补测 g1：{source_kind} 占位 executor 层展开落盘', () => {
  const outDir = makeTempDir();
  const d = doc({ sourceKind: 'daily-note' });
  const verdict = { action: 'digest' as const, ruleIndex: 0, targetPage: '日志/{source_kind}/{date}.md', depth: 'shallow' as const };
  const o = executeDigest(d, verdict, { outDir, now: NOW });
  assert.equal(o.status, 'digested');
  if (o.status !== 'digested') return;
  assert.equal(o.pagePath, join(outDir, '日志', 'daily-note', `${NOW_DATE}.md`));
  assert.ok(readFileSync(o.pagePath, 'utf8').includes('source_kind: daily-note'));
});

test('补测 g2：pageTitle 边界——>80 取「（无题）」/恰好 80 取首行', () => {
  const over = renderShallowPage(doc({ content: '长'.repeat(81) }), 'shallow', NOW);
  assert.ok(over.includes('# （无题）'), '>80 字符首行应弃用');
  const edge = renderShallowPage(doc({ content: '短'.repeat(80) }), 'shallow', NOW);
  assert.ok(edge.includes(`# ${'短'.repeat(80)}`), '恰好 80 应取首行');
});

test('补测 g3：写盘故障注入 → error outcome（真 I/O 故障非 mock）', () => {
  const workDir = makeTempDir();
  const notADir = join(workDir, 'not-a-dir');
  writeFileSync(notADir, 'x', 'utf8'); // outDir 位置预置为常规文件 → 后续 mkdir 必败

  const shallow = executeDigest(
    doc(),
    { action: 'digest', ruleIndex: 0, targetPage: '页/{date}.md', depth: 'shallow' },
    { outDir: notADir, now: NOW },
  );
  assert.equal(shallow.status, 'error');
  if (shallow.status !== 'error') return;
  assert.ok(shallow.reason.includes('写盘失败'), `实得 reason: ${shallow.reason}`);

  const deep = executeDigest(
    doc({ sourceKind: 'research-note' }),
    { action: 'digest', ruleIndex: 1, targetPage: 'x.md', depth: 'deep' },
    { outDir: notADir, now: NOW },
  );
  assert.equal(deep.status, 'error');
  if (deep.status !== 'error') return;
  assert.ok(deep.reason.includes('deep 队列写盘失败'), `实得 reason: ${deep.reason}`);
});
