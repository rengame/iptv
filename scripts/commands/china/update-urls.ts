/**
 * china/update-urls.ts
 *
 * 从上游来源同步 china.m3u 的流地址，按以下优先级依次尝试：
 *
 *   1. fanmingming/live           —— 通过标准化频道名模糊匹配（首选）
 *   2. iptv-org  streams/cn*.m3u  —— 通过 tvg-id 精确匹配（备选）
 *
 * 只更新 URL（及 #EXTVLCOPT 行），完全保留 group-title、中文名、logo 等。
 * 占位符 URL（http://0.0.0.0）会被优先替换。
 *
 * 用法：npm run china:update
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'

import { BROKEN_URL, DEAD_RECORD } from './constants'

const ROOT = path.resolve(__dirname, '../../..')
const CHINA_M3U = path.join(ROOT, 'china.m3u')
const STREAMS_DIR = path.join(ROOT, 'streams')

// iptv-org 上游文件优先级
const UPSTREAM_FILES = [
  'cn.m3u',
  'cn_cctv.m3u',
  'cn_cgtn.m3u',
  'cn_112114.m3u',
  'cn_yeslivetv.m3u',
]

// fanmingming/live 主播放列表（index.m3u 包含所有源）
const FANMINGMING_URL =
  'https://raw.githubusercontent.com/fanmingming/live/main/tv/m3u/index.m3u'

// 补充别名：china.m3u 标准化名称 → fanmingming 中的等价写法
// CCTV 系列已通过重命名直接对齐，此处仅处理少数特殊情况
const ALIASES: Record<string, string[]> = {
  'cctv-5+体育赛事': ['cctv5+体育赛事', 'cctv-5+体育赛事'],
  'cgtn':            ['中国国际电视台', 'cgtnnews'],
  '黑龙江':          ['黑龙江卫视'],
}

// ── 工具函数 ─────────────────────────────────────────────

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

/** 去除质量标注和标签，返回纯频道名用于匹配 */
function normalizeName(raw: string): string {
  return raw
    .replace(/\s*\([\d]+p\)/gi, '')   // (2160p) (1080p) 等
    .replace(/\s*\[[^\]]*\]/g, '')     // [非全天直播] [地区限制] 等
    .replace(/\s+/g, '')               // 去空格
    .toLowerCase()
}

/** 从 #EXTINF 行末尾逗号后取显示名称 */
function displayName(extinf: string): string {
  return extinf.split(',').slice(1).join(',').trim()
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

// ── 来源 1：iptv-org cn*.m3u ─────────────────────────────

function buildUpstreamMap(): Map<string, StreamEntry> {
  const map = new Map<string, StreamEntry>()
  for (const filename of UPSTREAM_FILES) {
    const fp = path.join(STREAMS_DIR, filename)
    if (!fs.existsSync(fp)) continue
    for (const entry of parseM3u(fs.readFileSync(fp, 'utf-8'))) {
      if (entry.tvgId && !map.has(entry.tvgId)) {
        map.set(entry.tvgId, entry)
      }
    }
  }
  return map
}

// ── 来源 2：fanmingming/live（fallback）──────────────────

async function buildFanmingmingMap(): Promise<Map<string, StreamEntry>> {
  const map = new Map<string, StreamEntry>()
  try {
    console.log('[fanmingming] 正在获取备用源...')
    const resp = await axios.get<string>(FANMINGMING_URL, {
      timeout: 30000,
      responseType: 'text',
    })
    const entries = parseM3u(resp.data)

    for (const entry of entries) {
      const name = normalizeName(displayName(entry.extinf))
      if (name && !map.has(name)) {
        map.set(name, entry)
      }
      // 同时用 tvg-id 索引（如果 fanmingming 带了 tvg-id）
      if (entry.tvgId && !map.has(entry.tvgId)) {
        map.set(entry.tvgId, entry)
      }
    }

    // 注册别名
    for (const [canonical, aliases] of Object.entries(ALIASES)) {
      const canonical_norm = normalizeName(canonical)
      const source = map.get(canonical_norm)
      if (source) {
        for (const alias of aliases) {
          if (!map.has(alias)) map.set(alias, source)
        }
      } else {
        // canonical 未匹配，尝试从别名找到条目后反向注册
        for (const alias of aliases) {
          const found = map.get(alias)
          if (found) {
            if (!map.has(canonical_norm)) map.set(canonical_norm, found)
            break
          }
        }
      }
    }

    console.log(`[fanmingming] 加载完成，共 ${entries.length} 个频道`)
  } catch (err: any) {
    console.warn(`[fanmingming] 加载失败（${err.message}），跳过备用源`)
  }
  return map
}

// ── 主流程 ──────────────────────────────────────────────

async function main() {
  const chinaRaw = fs.readFileSync(CHINA_M3U, 'utf-8')
  const headerLine = chinaRaw.split('\n')[0].trimEnd()
  const chinaEntries = parseM3u(chinaRaw)

  const upstreamMap = buildUpstreamMap()
  const fanmingmingMap = await buildFanmingmingMap()

  // 读取死链记录：tvg-id → 已确认失效的 URL
  const deadRecord: Record<string, string> = fs.existsSync(DEAD_RECORD)
    ? JSON.parse(fs.readFileSync(DEAD_RECORD, 'utf-8'))
    : {}

  let fromIptvOrg = 0
  let fromFanmingming = 0
  let unchanged = 0
  const notFound: string[] = []
  const clearedDead: string[] = []

  for (const entry of chinaEntries) {
    const isPlaceholder = entry.url === BROKEN_URL
    const knownDeadUrl = entry.tvgId ? deadRecord[entry.tvgId] : undefined
    const name = displayName(entry.extinf)
    const normName = normalizeName(name)

    // ── 来源 1：fanmingming，通过标准化名称匹配（首选）──
    const fanmingming = fanmingmingMap.get(normName) ?? fanmingmingMap.get(entry.tvgId ?? '')
    if (fanmingming && fanmingming.url !== knownDeadUrl) {
      const urlChanged = fanmingming.url !== entry.url
      const optsChanged =
        JSON.stringify(fanmingming.extvlcopt) !== JSON.stringify(entry.extvlcopt)

      if (isPlaceholder || urlChanged || optsChanged) {
        console.log(`[fanmingming] ${name.trim()}`)
        if (urlChanged || isPlaceholder) {
          console.log(`  旧: ${entry.url}`)
          console.log(`  新: ${fanmingming.url}`)
        }
        entry.url = fanmingming.url
        entry.extvlcopt = fanmingming.extvlcopt
        fromFanmingming++
        // fanmingming 提供了新 URL，清除死链记录
        if (knownDeadUrl && entry.tvgId) {
          delete deadRecord[entry.tvgId]
          clearedDead.push(entry.tvgId)
        }
      }
      // fanmingming 是首选，匹配到就停止，不再查 iptv-org
      continue
    }

    // ── 来源 2：iptv-org，通过 tvg-id 精确匹配（备选）──
    const upstream = entry.tvgId ? upstreamMap.get(entry.tvgId) : undefined
    if (upstream && upstream.url !== knownDeadUrl) {
      const urlChanged = upstream.url !== entry.url
      const optsChanged =
        JSON.stringify(upstream.extvlcopt) !== JSON.stringify(entry.extvlcopt)

      if (isPlaceholder || urlChanged || optsChanged) {
        console.log(`[iptv-org] ${name.trim()}`)
        if (urlChanged || isPlaceholder) {
          console.log(`  旧: ${entry.url}`)
          console.log(`  新: ${upstream.url}`)
        }
        entry.url = upstream.url
        entry.extvlcopt = upstream.extvlcopt
        fromIptvOrg++
        // iptv-org 提供了新 URL，清除死链记录
        if (knownDeadUrl && entry.tvgId) {
          delete deadRecord[entry.tvgId]
          clearedDead.push(entry.tvgId)
        }
        continue
      }
    }

    if (isPlaceholder) {
      notFound.push(`${name.trim()} (${entry.tvgId})`)
    }
    unchanged++
  }

  // 写回 china.m3u
  const lines: string[] = [headerLine]
  for (const entry of chinaEntries) {
    lines.push(entry.extinf)
    for (const opt of entry.extvlcopt) lines.push(opt)
    lines.push(entry.url)
  }
  lines.push('')
  fs.writeFileSync(CHINA_M3U, lines.join('\n'), 'utf-8')

  // 写回更新后的死链记录
  if (fs.existsSync(DEAD_RECORD)) {
    fs.writeFileSync(DEAD_RECORD, JSON.stringify(deadRecord, null, 2), 'utf-8')
  }

  console.log('\n════════════════════════════════════')
  console.log(`来自 fanmingming 更新：${fromFanmingming}`)
  console.log(`来自 iptv-org    更新：${fromIptvOrg}`)
  console.log(`无变化：${unchanged}`)
  if (clearedDead.length > 0) {
    console.log(`已清除死链记录：${clearedDead.length} 条（找到新 URL）`)
  }
  if (notFound.length > 0) {
    console.log(`\n⚠ 以下频道在两个来源中均未找到有效 URL（仍为占位符）：`)
    notFound.forEach(n => console.log(`  - ${n}`))
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
