// ── org 层读取扩展（LG-036 首条线锚 2：sync 扩 org 层）──────────────────
// 读 contentRoot/knowledge/org/（discipline-handbook+experience 页）——
// 注入侧=boot 摘要级辅助（混合案裁：前置核查拉取式为主+boot 摘要辅助）。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface OrgLayerSummary {
  handbookLines: number;
  experiencePages: string[];
  /** boot 摘要级注入文本（每文档变更一行；无内容=空串）。 */
  summary: string;
}

/** org 层摘要采集（contentRoot=TriCompany-copilot-host-assets 解析位）。 */
export function collectOrgLayerSummary(contentRoot: string): OrgLayerSummary {
  const orgDir = join(contentRoot, 'knowledge', 'org');
  if (!existsSync(orgDir)) return { handbookLines: 0, experiencePages: [], summary: '' };

  const lines: string[] = [];
  let handbookLines = 0;
  const handbookPath = join(orgDir, 'discipline-handbook.md');
  if (existsSync(handbookPath)) {
    const text = readFileSync(handbookPath, 'utf-8');
    handbookLines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length;
    lines.push(`纪律手册：${handbookLines} 行（org/discipline-handbook.md）`);
  }
  const experiencePages: string[] = [];
  const expDir = join(orgDir, 'experiences');
  if (existsSync(expDir)) {
    for (const f of readdirSync(expDir)) {
      if (f.endsWith('.md')) experiencePages.push(f);
    }
    if (experiencePages.length) lines.push(`经验页：${experiencePages.length} 页`);
  }

  return { handbookLines, experiencePages, summary: lines.join('；') };
}
