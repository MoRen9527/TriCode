// ── trimodel-cli core · L-F 入口层（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// 公共导出面（四仓 bin 经 file:../TriCode 引用的唯一点）+ runCli argv 派发器。
// 四族统一形态（CTO 扩展条款）：父命令 model——<bin> model restore-direct|config|status；
// 契约面三命令（派工单范围③），rollback 保持 HTTP 面+内核导出（CLI 面不扩权）。
// 未知旗标拒收（fail-closed：恢复工具上旗标拼错静默落默认=脚枪）。

import type { CoreIO } from './env.js';
import {
  configGet, configList, configSet, restoreDirect, statusCommand,
  type ConfigSetArgs, type RestoreDirectArgs, type StatusArgs,
} from './commands.js';
import { CORE_VERSION, renderResult, type ResultCode, type ResultLine } from './result.js';

// 公共导出面（桶形转发；实现在各分层文件，此处只聚合一处引用点）
export {
  // L-A 纯函数
  BACKUP_KEEP, MODEL_TIER_KEYS, credentialGate, envSubsetDiff, maskKey, normalizeInput,
  tokenMaskedFrom, validateTriplet,
  type RestoreInput, type SettingsDoc,
} from './pure.js';
// L-C 环境+CoreIO
export {
  AUDIT_LOG_ENV, DEFAULT_PROVIDER, DEFAULT_PROVIDER_ENV, DEPLOY_KEY_ENV, SETTINGS_FILE_ENV,
  appendAudit, defaultAuditLogPath, defaultDeployKeyPath, defaultPresetsDir, defaultSettingsPath,
  makeCoreIO, resolveDefaultProvider,
  type CoreIO, type DeployKeyResolution, type ProbeReading,
} from './env.js';
// L-B IO 内核
export {
  describeCurrent, listBackups, readSettings, rollbackTo, rotateBackups, runWrite, tripletError,
  verifyWritten,
  type BackupMeta, type RollbackPlan, type WriteOutcome, type WritePlan,
} from './io-kernel.js';
// L-D 模板
export {
  findPreset, loadPresets, readDeployKey,
  type DeployKeyRead, type DeployKeyReject, type PresetsLoad, type ProviderPreset,
} from './presets.js';
// L-E 命令编排
export {
  configGet, configList, configSet, restoreDirect, rollback, statusCommand,
  type ConfigSetArgs, type RestoreDirectArgs, type StatusArgs,
} from './commands.js';
// ResultLine 三统一
export { CORE_VERSION, renderResult, type ResultCode, type ResultLine } from './result.js';

type Write = (line: string) => void;

function defaultWrite(line: string): void {
  process.stdout.write(line + '\n');
}

class UsageError extends Error {}

interface ParsedFlags {
  _: string[];
  [flag: string]: unknown;
}

/** 极薄旗标解析：`--name value`｜`--name=value`｜布尔旗标（无值/值为下一旗标= true）。 */
function parseFlags(tokens: string[]): ParsedFlags {
  const out: ParsedFlags = { _: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('--')) { out._.push(t); continue; }
    const eq = t.indexOf('=');
    if (eq > 2) { out[t.slice(2, eq)] = t.slice(eq + 1); continue; }
    const name = t.slice(2);
    const next = tokens[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[name] = next; i += 1; } else { out[name] = true; }
  }
  return out;
}

function optStr(flags: ParsedFlags, name: string): string | undefined {
  const v = flags[name];
  if (v === undefined || v === true) {
    if (v === true) throw new UsageError(`旗标 --${name} 需要一个值`);
    return undefined;
  }
  return String(v);
}

function optBool(flags: ParsedFlags, name: string): boolean {
  const v = flags[name];
  return v === true || v === 'true' || v === '';
}

function optNum(flags: ParsedFlags, name: string): number | undefined {
  const v = flags[name];
  if (v === undefined) return undefined;
  const n = Number(typeof v === 'string' ? v : NaN);
  if (!Number.isFinite(n)) throw new UsageError(`旗标 --${name} 需要一个数字`);
  return n;
}

/** 未知旗标拒收（fail-closed：--providr 拼错静默落默认=恢复工具脚枪）。 */
function rejectUnknownFlags(flags: ParsedFlags, known: string[]): void {
  const unknown = Object.keys(flags).filter((k) => k !== '_' && !known.includes(k));
  if (unknown.length > 0) throw new UsageError(`未知旗标：${unknown.map((k) => `--${k}`).join(' ')}（可用：${known.map((k) => `--${k}`).join(' ')}）`);
}

function helpText(bin: string): string {
  return [
    `${bin} model — TriModel 兜底直连恢复梯命令（core v${CORE_VERSION}）`,
    '',
    '四族统一形态（父命令 model）：',
    `  ${bin} model restore-direct [--provider <id>] [--key-file <path>] [--dry-run]`,
    '      零参数=安全侧默认 provider（bigmodel）；读模板+独立钥→五门写入设置文件',
    `  ${bin} model config list`,
    '      模板表+现役配置摘要',
    `  ${bin} model config get [KEY...]`,
    '      现役 env 键形投影（凭据仅 len，不回显内容）',
    `  ${bin} model config set --provider <id> [--base-url <u>] [--model <m>] [--key-file <p>] [--dry-run]`,
    '      与页面同一套五门内核；钥恒走独立钥文件，零钥值过命令行',
    `  ${bin} model status [--backups <n>]`,
    '      现役配置+实时探活+L2 标记态+备份清单（只读）',
    `  ${bin} model --version`,
    '      core 版本',
  ].join('\n');
}

/**
 * runCli：argv 派发器（bin 侧唯一调用点）。父命令头 token `model` 容忍带/不带
 * （四族统一形态=<bin> model <cmd>；core 级直调可省）。返回进程退出码：
 * 0=成功｜1=业务拒（ResultLine.ok=false）｜2=用法错（UsageError/未知命令）。
 */
export async function runCli(argv: string[], io: CoreIO, write: Write = defaultWrite): Promise<number> {
  const bin = io.binName ?? 'trimodel';
  try {
    const tokens = argv[0] === 'model' ? argv.slice(1) : [...argv];
    const cmd = tokens[0];
    const flags = parseFlags(tokens.slice(1));

    if (cmd === undefined || cmd === 'help' || cmd === '--help' || cmd === '-h') {
      write(helpText(bin));
      return cmd === undefined ? 2 : 0;
    }
    if (cmd === '--version' || cmd === '-v') {
      write(CORE_VERSION);
      return 0;
    }

    let result: ResultLine;
    if (cmd === 'restore-direct') {
      rejectUnknownFlags(flags, ['provider', 'key-file', 'dry-run']);
      const args: RestoreDirectArgs = {
        provider: optStr(flags, 'provider'),
        keyFile: optStr(flags, 'key-file'),
        dryRun: optBool(flags, 'dry-run'),
      };
      result = restoreDirect(args, io);
    } else if (cmd === 'config') {
      const sub = flags._[0];
      if (sub === 'list') {
        rejectUnknownFlags(flags, []);
        result = configList({}, io);
      } else if (sub === 'get') {
        rejectUnknownFlags(flags, []);
        result = configGet({ keys: flags._.slice(1) }, io);
      } else if (sub === 'set') {
        rejectUnknownFlags(flags, ['provider', 'base-url', 'model', 'key-file', 'dry-run']);
        const args: ConfigSetArgs = {
          provider: optStr(flags, 'provider'),
          base_url: optStr(flags, 'base-url'),
          model: optStr(flags, 'model'),
          keyFile: optStr(flags, 'key-file'),
          dryRun: optBool(flags, 'dry-run'),
        };
        result = configSet(args, io);
      } else {
        throw new UsageError(`未知子命令 config ${sub ?? '（空）'}（可用：list / get / set）`);
      }
    } else if (cmd === 'status') {
      rejectUnknownFlags(flags, ['backups']);
      const args: StatusArgs = { backups: optNum(flags, 'backups') };
      result = await statusCommand(args, io);
    } else {
      throw new UsageError(`未知命令：${cmd}（可用：restore-direct / config / status / --version）`);
    }

    write(renderResult(result));
    return result.ok ? 0 : 1;
  } catch (err) {
    if (err instanceof UsageError) {
      write(`FAIL [INVALID_INPUT] ${err.message}`);
      write(helpText(bin));
      return 2;
    }
    write(`FAIL [WRITE_FAILED] 命令执行异常：${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
