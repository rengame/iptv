/**
 * china/fix-broken.ts
 *
 * 测试 china.m3u 中每个频道的 URL 是否有效。
 * 对于失效的 URL：
 *   1. 将其替换为占位符 http://0.0.0.0
 *   2. 将 tvg-id → 死链URL 的映射写入 china.dead.json
 *      update-urls.ts 会读取此文件，跳过 iptv-org 中相同的死链，
 *      转而从 fanmingming/live 等其他源寻找替代 URL。
 *
 * 跳过规则：
 *   - 带 [地区限制] 标签：测试环境可能不在该地区
 *   - 带 [非全天直播] 标签：当前可能处于停播时段
 *   - 已经是占位符：无需重复测试
 *
 * 用法：npm run china:fix
 */

import axios from 'axios'
import fs from 'fs'
import { eachLimit } from 'async'

import { BROKEN_URL, DEAD_RECORD, CHINA_M3U } from './constants'

const CONCURRENCY = 8
const TIMEOUT_MS = 12000

const SKIP_LABEL_PATTERNS = [/地区限制/, /非全天直播/, /Geo-blocked/, /Not 24\/7/]

interface Entry {
  extinf: string
  extvlcopt: string[]
  url: string
  tvgId: string
  label: string
}

function parseTvgId(extinf: string): string {
  const m = extinf.match(/tvg-id="([^"]*)"/)
  return m ? m[1] : ''
}

function parseLabel(extinf: string): string {
  const name = extinf.split(',').slice(1).join(',')
  const m = name.match(/\[([^\]]+)\]/g)
  return m ? m.join(' ') : ''
}

function shouldSkip(entry: Entry): boolean {
  if (entry.url === BROKEN_URL) return true
  return SKIP_LABEL_PATTERNS.some(p => p.test(entry.label))
}

function parseM3u(content: string): Entry[] {
  const lines = content.split('\n')
  const entries: Entry[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trimEnd()
    if (line.startsWith('#EXTINF')) {
      const extinf = line
      const extvlcopt: string[] = []
      i++
      while (i < lines.length && lines[i].trimEnd().startsWith('#EXTVLCOPT')) {
        extvlcopt.push(lines[i].trimEnd())
        i++
      }
      if (i < lines.length) {
        const url = lines[i].trimEnd()
        if (url && !url.startsWith('#')) {
          entries.push({ extinf, extvlcopt, url, tvgId: parseTvgId(extinf), label: parseLabel(extinf) })
          i++
          continue
        }
      }
    }
    i++
  }
  return entries
}

async function testUrl(url: string): Promise<boolean> {
  try {
    await axios.get(url, {
      timeout: TIMEOUT_MS,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IPTV checker)',
        Range: 'bytes=0-1023',
      },
      validateStatus: status => status < 500,
    })
    return true
  } catch (err: any) {
    const code: string = err.code ?? ''
    const status: number = err.response?.status ?? 0
    if (['ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH', 'EPROTO'].includes(code)) return false
    if (status === 404 || status === 410) return false
    // 超时、403、5xx 保守处理——保留 URL，可能是临时问题
    return true
  }
}

// ── 主流程 ──────────────────────────────────────────────

async function main() {
  const raw = fs.readFileSync(CHINA_M3U, 'utf-8')
  const headerLine = raw.split('\n')[0].trimEnd()
  const entries = parseM3u(raw)

  // 读取已有死链记录（避免重复累积）
  const deadRecord: Record<string, string> = fs.existsSync(DEAD_RECORD)
    ? JSON.parse(fs.readFileSync(DEAD_RECORD, 'utf-8'))
    : {}

  const toTest = entries.filter(e => !shouldSkip(e))
  const skipped = entries.length - toTest.length

  console.log(`共 ${entries.length} 个频道，跳过 ${skipped} 个（含标签或已是占位符），测试 ${toTest.length} 个`)

  let broken = 0
  let ok = 0

  await eachLimit(toTest, CONCURRENCY, async (entry: Entry) => {
    const alive = await testUrl(entry.url)
    if (alive) {
      ok++
      // 如果之前是死链但现在活了，从记录中移除
      delete deadRecord[entry.tvgId]
    } else {
      broken++
      const name = entry.extinf.split(',').slice(1).join(',').trim()
      console.log(`[失效] ${name}`)
      console.log(`       ${entry.url}`)
      // 记录死链：tvg-id → 死链URL
      if (entry.tvgId) deadRecord[entry.tvgId] = entry.url
      entry.url = BROKEN_URL
    }
  })

  // 写回 china.m3u
  const lines: string[] = [headerLine]
  for (const entry of entries) {
    lines.push(entry.extinf)
    for (const opt of entry.extvlcopt) lines.push(opt)
    lines.push(entry.url)
  }
  lines.push('')
  fs.writeFileSync(CHINA_M3U, lines.join('\n'), 'utf-8')

  // 写回死链记录
  fs.writeFileSync(DEAD_RECORD, JSON.stringify(deadRecord, null, 2), 'utf-8')

  console.log('\n════════════════════════════════════')
  console.log(`有效：${ok}  失效（已置占位符）：${broken}  跳过：${skipped}`)
  console.log(`死链记录已写入 china.dead.json（共 ${Object.keys(deadRecord).length} 条）`)
  console.log('运行 npm run china:update 可从其他源尝试恢复')
}

if (require.main === module) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
