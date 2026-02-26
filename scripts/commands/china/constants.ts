import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')

/** 失效 URL 的占位符，保留频道条目供下次 update 匹配 */
export const BROKEN_URL = 'http://0.0.0.0'

/** 记录已确认失效的 URL，格式：{ tvg-id: 死链URL } */
export const DEAD_RECORD = path.join(ROOT, 'china.dead.json')

/** china.m3u 路径 */
export const CHINA_M3U = path.join(ROOT, 'china.m3u')

/** iptv-org 上游文件优先级 */
export const UPSTREAM_FILES = [
  'cn.m3u',
  'cn_cctv.m3u',
  'cn_cgtn.m3u',
  'cn_112114.m3u',
  'cn_yeslivetv.m3u',
]

export const STREAMS_DIR = path.join(ROOT, 'streams')
