/**
 * china/update-urls.ts
 *
 * 从上游 streams/cn*.m3u 文件中同步 china.m3u 的流地址。
 * 以 tvg-id 为键匹配频道，只更新 URL（及 #EXTVLCOPT 行），
 * 保留 china.m3u 中的 group-title、中文名称、logo 等自定义内容。
 *
 * 用法：npm run china:update
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')
const CHINA_M3U = path.join(ROOT, 'china.m3u')
const STREAMS_DIR = path.join(ROOT, 'streams')

// 上游源文件优先级（排在前面的优先选取 URL）
const UPSTREAM_FILES = [
  'cn.m3u',
  'cn_cctv.m3u',
  'cn_cgtn.m3u',
  'cn_112114.m3u',
  'cn_yeslivetv.m3u',
]

interface StreamEntry {
  extinf: string
  extvlcopt: string[]
  url: string
  tvgId: string
}

function extractTvgId(extinf: string): string {
  const m = extinf.match(/tvg-id="([^"]*)"/)
  return m ? m[1] : ''
}

function parseM3u(content: string): StreamEntry[] {
  const lines = content.split('\n')
  const entries: StreamEntry[] = []
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
          entries.push({ extinf, extvlcopt, url, tvgId: extractTvgId(extinf) })
          i++
          continue
        }
      }
    }
    i++
  }

  return entries
}

function buildUpstreamMap(): Map<string, StreamEntry> {
  const map = new Map<string, StreamEntry>()

  for (const filename of UPSTREAM_FILES) {
    const filepath = path.join(STREAMS_DIR, filename)
    if (!fs.existsSync(filepath)) continue

    const entries = parseM3u(fs.readFileSync(filepath, 'utf-8'))
    for (const entry of entries) {
      if (!entry.tvgId) continue
      // 只取每个 tvg-id 的第一个出现（按文件优先级）
      if (!map.has(entry.tvgId)) {
        map.set(entry.tvgId, entry)
      }
    }
  }

  return map
}

function writeM3u(entries: StreamEntry[], header: string): string {
  const lines: string[] = [header]
  for (const entry of entries) {
    lines.push(entry.extinf)
    for (const opt of entry.extvlcopt) {
      lines.push(opt)
    }
    lines.push(entry.url)
  }
  lines.push('')
  return lines.join('\n')
}

// ── 主流程 ──────────────────────────────────────────────

const chinaRaw = fs.readFileSync(CHINA_M3U, 'utf-8')

// 保留原始 #EXTM3U 头行（可能带属性）
const headerLine = chinaRaw.split('\n')[0].trimEnd()

const chinaEntries = parseM3u(chinaRaw)
const upstreamMap = buildUpstreamMap()

let updatedCount = 0
let unchangedCount = 0
const notFoundIds: string[] = []

for (const entry of chinaEntries) {
  if (!entry.tvgId) {
    console.warn(`[跳过] 无 tvg-id：${entry.extinf}`)
    unchangedCount++
    continue
  }

  const upstream = upstreamMap.get(entry.tvgId)
  if (!upstream) {
    notFoundIds.push(entry.tvgId)
    unchangedCount++
    continue
  }

  const urlChanged = upstream.url !== entry.url
  const optsChanged = JSON.stringify(upstream.extvlcopt) !== JSON.stringify(entry.extvlcopt)

  if (urlChanged || optsChanged) {
    const displayName = entry.extinf.split(',').slice(1).join(',')
    console.log(`[更新] ${displayName.trim()} (${entry.tvgId})`)
    if (urlChanged) {
      console.log(`       旧: ${entry.url}`)
      console.log(`       新: ${upstream.url}`)
    }
    entry.url = upstream.url
    entry.extvlcopt = upstream.extvlcopt
    updatedCount++
  } else {
    unchangedCount++
  }
}

fs.writeFileSync(CHINA_M3U, writeM3u(chinaEntries, headerLine), 'utf-8')

// ── 结果报告 ─────────────────────────────────────────────

console.log('\n════════════════════════════════════')
console.log(`已更新：${updatedCount} 个频道`)
console.log(`无变化：${unchangedCount} 个频道`)

if (notFoundIds.length > 0) {
  console.log(`\n⚠ 在上游文件中未找到以下频道（URL 保持不变）：`)
  notFoundIds.forEach(id => console.log(`  - ${id}`))
}
