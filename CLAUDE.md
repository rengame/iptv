# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个社区驱动的 IPTV 播放列表管理项目，使用 TypeScript + Node.js 自动化管理、验证和发布全球公开电视频道的 M3U 播放列表。用户通过 GitHub Issues 提交频道，CI/CD 每天自动处理并生成多维度的公开播放列表。

## 常用命令

```bash
# 安装依赖（自动运行 api:load 下载频道元数据）
npm install

# 格式化播放列表（规范化、去重、排序）
npm run playlist:format

# M3U 语法检查
npm run playlist:lint

# 验证频道 ID 和链接有效性
npm run playlist:validate

# 生成所有公开播放列表到 .gh-pages/
npm run playlist:generate

# 处理 GitHub Issues（添加/编辑/删除流）
npm run playlist:update

# 测试流链接可用性
npm run playlist:test

# 代码检查
npm run lint

# 运行测试
npm run test

# 运行单个测试文件
npx jest tests/path/to/test.ts

# 本地模拟 CI 工作流（需要 act 工具）
npm run act:check
npm run act:update
```

## 架构概览

### 数据流向

```
GitHub Issues（用户提交）
    → playlist:update（解析 Issue，更新 /streams）
    → playlist:lint + validate（质量控制）
    → playlist:generate（生成 14 种维度播放列表）
    → .gh-pages/（部署到 GitHub Pages）
    → .api/streams.json（推送到 iptv-org/api）
```

### 关键目录

- **`/streams/`** — 内部原始 M3U 文件（按国家/地区，320+ 个文件），这是编辑的主要对象
- **`/scripts/commands/playlist/`** — 7 个核心命令脚本（format/update/generate/validate/lint/test/export）
- **`/scripts/generators/`** — 14 个生成器，生成按国家、语言、类别、地区等分组的播放列表
- **`/scripts/core/`** — 核心功能：PlaylistParser、IssueLoader、IssueParser、StreamTester 等
- **`/scripts/api.ts`** — 从 `@iptv-org/sdk` 加载并索引频道元数据（13 个 JSON 数据文件）
- **`.gh-pages/`** — 生成的公开播放列表（自动生成，不要手动编辑）
- **`/tests/`** — Jest 单元测试

### M3U 文件格式规范

`/streams` 中的文件须遵循此格式：

```m3u
#EXTM3U
#EXTINF:-1 tvg-id="ChannelID" tvg-logo="URL" group-title="分类",频道名 (质量) [标签]
#EXTVLCOPT:http-referrer=http://example.com
#EXTVLCOPT:http-user-agent=Mozilla/5.0
https://stream.url/playlist.m3u8
```

验证规则定义在 `m3u-linter.json`（需要 header、引号、tvg 信息、无空行等）。

### CI/CD 工作流

- **`update.yml`** — 每天 UTC 0:00 自动运行完整流程（update → lint → validate → generate → export → deploy）
- **`check.yml`** — PR 触发，仅检查修改的文件（lint + validate）
- **`format.yml`** — 手动触发，规范化所有播放列表
- **`stale.yml`** — 每天关闭 180 天无活动的 Issue

### Stream 数据模型

Stream 对象的关键字段（来自 `scripts/models/stream.ts`）：

- `channel` — 频道 ID（对应 `@iptv-org/sdk` 中的频道数据库）
- `url` — 流 URL
- `quality` — 质量标签（720p, 1080p 等）
- `label` — 状态标签（Geo-blocked, Not 24/7 等）
- `filepath` — 所属 M3U 文件路径

### 注意事项

- `postinstall` 会自动运行 `api:load`，从 `@iptv-org/sdk` 下载最新频道元数据到本地
- 生成器输出到 `.gh-pages/`，此目录不在版本控制中
- `china.m3u` 是手动维护的中国频道固定文件，在生成流程之外
- 测试文件匹配规则：`tests/(.*?/)?.*test.ts$`

---

## china.m3u 频道清单

`china.m3u` 共 112 个频道，10 个分组，按 `group-title` 分组如下。`tvg-id` 是与上游 `streams/cn*.m3u` 同步 URL 的唯一匹配键。

### 央视频道（22个）

| 显示名称 | tvg-id |
|---------|--------|
| 央视综合 (2160p) | CCTV1.cn@SD |
| 央视财经 (2160p) | CCTV2.cn@SD |
| 央视综艺 (2160p) | CCTV3.cn@SD |
| 央视体育 (2160p) | CCTV5.cn@SD |
| 央视体育赛事 (2160p) | CCTV5Plus.cn@SD |
| 央视电影 (2160p) | CCTV6.cn@SD |
| 央视国防军事 (2160p) | CCTV7.cn@SD |
| 央视电视剧 (2160p) | CCTV8.cn@SD |
| 央视纪录 (2160p) | CCTV9.cn@SD |
| 央视科教 (2160p) | CCTV10.cn@SD |
| 央视戏曲 (576p) | CCTV11.cn@SD |
| 央视社会与法 (2160p) | CCTV12.cn@SD |
| 央视新闻 (1080p) | CCTV13.cn@SD |
| 央视少儿 (2160p) | CCTV14.cn@SD |
| 央视音乐 (576p) | CCTV15.cn@SD |
| 央视奥林匹克 (2160p) | CCTV16.cn@SD |
| 央视农业农村 (2160p) | CCTV17.cn@SD |
| 央视国际1 (600p) [非全天直播] | CCTVPlus1.cn@SD |
| 央视国际2 (600p) [非全天直播] | CCTVPlus2.cn@SD |
| 中国国际电视台 (1080p) | CGTN.cn@SD |
| 央视中文国际（美洲版）(1080p) | CCTV4America.cn@SD |
| 央视中文国际（欧洲版） | CCTV4Europe.cn@SD |

### 各省卫视（33个）

| 显示名称 | tvg-id |
|---------|--------|
| 安徽卫视 (2160p) | AnhuiSatelliteTV.cn@SD |
| 北京卫视 [非全天直播] | BeijingSatelliteTV.cn@SD |
| 兵团卫视 | BingtuanSatelliteTV.cn@SD |
| 重庆卫视 (1080p) | ChongqingTVInternational.cn@SD |
| 东方卫视 (2160p) | DragonTV.cn@SD |
| 东方卫视国际版 (360p) | DragonTVInternational.cn@SD |
| 甘肃卫视 (576p) | GansuTV.cn@SD |
| 广东卫视 (2160p) | GuangdongSatelliteTV.cn@SD |
| 广西卫视 (576p) | GuangxiTV.cn@SD |
| 贵州卫视 (576p) | GuizhouTV.cn@SD |
| 海南卫视 (576p) | HainanSatelliteTV.cn@SD |
| 河北卫视 (2160p) | HebeiTV.cn@SD |
| 河南卫视 (2160p) | HenanTVSatellite.cn@SD |
| 黑龙江 (1080p) | HeilongjiangTV.cn@SD |
| 湖北卫视 (1080p) | HubeiSatelliteTV.cn@SD |
| 湖南卫视 (2160p) | HunanTV.cn@SD |
| 江苏卫视 (1080p) [非全天直播] | JiangsuSatelliteTV.cn@SD |
| 江西卫视 (1080p) | JiangxiTV.cn@SD |
| 吉林卫视 (2160p) | JilinSatelliteTV.cn@SD |
| 康巴卫视 (720p) [非全天直播] | YanbianSatelliteTV.cn@SD |
| 辽宁卫视 (1080p) | LiaoningTV.cn@SD |
| 宁夏卫视 (576p) [非全天直播] | NingxiaSatelliteChannel.cn@SD |
| 青海卫视 (1080p) | QinghaiTV.cn@SD |
| 陕西农林卫视 | ShaanxiAgroforestrySatelliteTV.cn@SD |
| 山东卫视 (720p) | ShandongSatelliteTV.cn@SD |
| 山东卫视 (1080p) | ShandongTV.cn@SD |
| 山西卫视 (2160p) | ShanxiTV.cn@SD |
| 深圳卫视 (2160p) | ShenzhenSatelliteTV.cn@SD |
| 四川卫视 (576p) | SichuanSatelliteTV.cn@SD |
| 天津卫视 (1080p) | TianjinTV.cn@SD |
| 云南卫视 (1080p) | YunnanSatelliteTV.cn@SD |
| 浙江卫视 | ZhejiangSatelliteTV.cn@SD |
| 浙江国际频道 | ZhejiangInternationalChannel.cn@SD |

### 综合（2个）

| 显示名称 | tvg-id |
|---------|--------|
| 广州电视台 | GuangzhouTV.cn@SD |
| 四平电视台 | SipingTV.cn@SD |

### 新闻（11个）

| 显示名称 | tvg-id |
|---------|--------|
| 安顺新闻综合频道 | AnshunComprehensiveNewsChannel.cn@SD |
| 滁州市广播电视台 新闻综合频道 (1080p) | ChuzhouNewsChannel.cn@SD |
| DHA新闻通讯社 (720p) [非全天直播] | DHA.tr@SD |
| 哈尔滨综合新闻频道 | HarbinComprehensiveNewsChannel.cn@SD |
| 鹤壁新闻综合 (480p) [非全天直播] | HebiNewsChannel.cn@SD |
| 酒泉新闻综合 (576p) | JiuquanTVNewsComprehensiveChannel.cn@SD |
| 地铁环球新闻网 (1080p) [非全天直播] | MetroGlobeNetwork.id@SD |
| 萍鄉新聞綜合 (576p) [非全天直播] | PingxiangTVNewsChannel.cn@SD |
| 青岛综合频道 | QTV1.cn@SD |
| 通化电视台 | TonghuaTV.cn@SD |
| 长沙新闻 [地区限制] | HunanNewsChannel.cn@SD |

### 电影（8个）

| 显示名称 | tvg-id |
|---------|--------|
| 动作电影 (1080p) | CHCAction.cn@SD |
| 家庭影院 (1080p) | CHCHomeTheater.cn@SD |
| 哈尔滨影视频道 | HarbinMovieChannel.cn@SD |
| 江西影视频道 | JiangxiMovieChannel.cn@SD |
| 江苏影视 (576p) [非全天直播] | JiangsuMovieChannel.cn@SD |
| 吉林影视频道 | JilinMovieChannel.cn@SD |
| 亚洲影院 (1080p) [地区限制] | MyCinemaAsia.id@SD |
| 青岛影视频道 | QTV3.cn@SD |

### 儿童（9个）

| 显示名称 | tvg-id |
|---------|--------|
| 婴儿第一频道 | BabyFirst.us@US |
| 北京卡酷少儿频道 | BRTVKakuChildrensChannel.cn@SD |
| 金鹰卡通 | GoldenEagleCartoon.cn@SD |
| 佳佳卡通 | JiaJiaCartoon.cn@SD |
| 江西少儿频道 | JiangxiChildrensChannel.cn@SD |
| 山东少儿 (406p) [地区限制] | ShandongTVChildrensChannel.cn@SD |
| 四川妇女儿童 (720p) [非全天直播] | SichuanTVWomenandChildrenChannel.cn@SD |
| 炫动卡通 | ToonmaxTV.cn@SD |
| 优漫卡通 (576p) | YouManCartoonChannel.cn@SD |

### 教育（6个）

| 显示名称 | tvg-id |
|---------|--------|
| 中国教育1套 (576p) | CETV1.cn@SD |
| 中国教育2套 (576p) | CETV2.cn@SD |
| 法制频道 | ChannelLaw.cn@SD |
| 江苏教育 (576p) [非全天直播] | JiangsuEducationalChannel.cn@SD |
| 山东教育电视台 | ShandongEducationTV.cn@SD |
| 上海教育电视台 | ShanghaiEducationTelevisionStation.cn@SD |

### 体育（4个）

| 显示名称 | tvg-id |
|---------|--------|
| 游戏频道 | GameChannel.cn@SD |
| 江苏体育 (576p) | JiangsuSportsLeisureChannel.cn@SD |
| 山东体育 (1080p) [地区限制] | ShandongTVSportsChannel.cn@SD |
| 上海五星体育 | SMGFootballChannel.cn@SD |

### 娱乐（3个）

| 显示名称 | tvg-id |
|---------|--------|
| 八度空间 | 8TV.my@SD |
| 城市影院 | CityTheaterChannel.cn@SD |
| 欢笑剧场 | LaughterTheater.cn@SD |

### 未分类（14个）

| 显示名称 | tvg-id |
|---------|--------|
| 中国教育4套 | CETV4.cn@SD |
| 发现之旅 (576p) | CNDFilmDiscoveryChannel.cn@SD |
| 爱自然频道 (720p) [地区限制] | LoveNature.ca@SD |
| 四海钓鱼频道 | SihaiFishingChannel.cn@SD |
| 纪录人文频道 | DocumentaryHumanitiesChannel.cn@SD |
| 敦煌电视台 (1080p) | DunhuangTV.cn@SD |
| 高台电视台 (1080p) | HighChannelTV.cn@SD |
| 内蒙古卫视 | NeiMonggolTV.cn@SD |
| 山东生活 (1080p) [地区限制] | ShandongTVLifeChannel.cn@SD |
| 山东综艺 (406p) [地区限制] | ShandongTVVarietyChannel.cn@SD |
| 山东齐鲁 (1080p) [地区限制] | ShandongTVQiluChannel.cn@SD |
| 新疆卫视1 | XinjiangTV1.cn@SD |
| 新疆卫视12 | XinjiangTV12.cn@SD |
| 第一财经频道 | YicaiTV.cn@SD |
