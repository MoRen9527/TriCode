// ── trimodel-cli core · ResultLine 三统一 schema（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// 设计正身=FSD 波③ core 导出面接口清单 r2（TMV 68f64c9e）§2；CTO 四点裁决已织入。
// 判据（joint-plan 问3/CPO）：语法·结果行·输出风格三统一——HTTP 壳与四族命令行同构映射。

/** core 版本（CTO 施工序批复①：版本锁定纪律——core 改动 bump 此值+package.json version，
 * 四仓 file: 依赖同步重装，验收门③ 随正名对照表呈版本一致性读数。与 TriCode package.json
 * version 保持同字面值。 */
export const CORE_VERSION = '0.2.1-wave3';

/** 结果码族（结构化 RESULT 行判别符；HTTP 壳按此映射现役 statusCode，壳语义不动）。 */
export type ResultCode =
  | 'OK'                        // 只读命令成功（config list/get、status 答得出状态）
  | 'RESTORED'                  // 五门写入成功
  | 'ALREADY_SAME'              // 门① 幂等短路：已是指定值，零重写
  | 'ROLLED_BACK'               // 一键回滚成功
  | 'WRITE_FAILED_ROLLED_BACK'  // 门④ 写后断言失败→自动回滚（回滚本身也可能失败，detail 见 data）
  | 'WRITE_FAILED'              // 备份/写盘失败（零半写）
  | 'KEY_FAIL_CLOSED'           // 门③ 凭据健康门拒（占位符/空白/短键）
  | 'DEPLOY_KEY_MISSING'        // 独立钥文件缺失（fail-closed）
  | 'DEPLOY_KEY_INVALID'        // 独立钥文件空/未过健康门（fail-closed）
  | 'PRESET_UNKNOWN'            // provider 不存在（fail-closed 列可用模板）
  | 'PRESET_NOT_DEPLOYED'       // deployed:false 同拒（CTO 裁④：CLI 与 HTTP 防线一致）
  | 'INVALID_INPUT'             // 三输入格式拒（地址/模型/键族格式）
  | 'PRESETS_LOAD_FAILED'       // presets 目录不可读/全部拒载（装载器 fail-closed）
  | 'SETTINGS_UNREADABLE'       // settings 文件坏 JSON 等读面故障（写面拒、读面人话）
  | 'PROBE_DEGRADED';           // 探针不可达（status 如实报，命令本身成功）

/** 三统一 RESULT 行：code=机器判别符；message=人话行（出了什么事/什么状态/做什么）；
 * data=结构化体（HTTP body 与命令行摘要共用，密钥只 len-only/掩码形态）。 */
export interface ResultLine {
  ok: boolean;
  code: ResultCode;
  message: string;
  data?: Record<string, unknown>;
}

/** 命令行渲染：首行 `OK|FAIL [CODE] 人话`，data 摘要行随（密钥安全：data 已是 len-only/掩码形态）。 */
export function renderResult(r: ResultLine): string {
  const lines: string[] = [`${r.ok ? 'OK' : 'FAIL'} [${r.code}] ${r.message}`];
  if (r.data) {
    for (const [k, v] of Object.entries(r.data)) {
      lines.push(`  ${k} = ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
  }
  return lines.join('\n');
}
