# 沉浸式单件材质展示台 — 设计规格

日期：2026-11-02
状态：待用户审阅
第一轮范围：一件衣服（`tee` 短袖 → 皮革）

## 1. 背景与问题诊断

上游项目 `interactive-garment-starter` 是一个"挂杆 + 悬停转身"的展示页。实测结论：

1. 每件衣服是预渲染的 30 帧透明图集（384×448/帧），前端 canvas 逐帧播放，**没有任何布料形变自由度**，转正是纯刚性旋转 → 观感僵硬。
2. 全 5 套素材的角度弧都是「左侧影 → 正面」约 **90°**，不含背面与右侧。
3. 单帧仅 384×448，放大 3× 后印花糊、织物区是平滑渐变、无针织纹理 → **无法承载面料级细节展示**。
4. 商品详情只有静态正/背图，无面料参数、无微距、无光位对照。

结论：问题不在动效层，在**素材上限**与**缺少材质层**。要商业级，需要同时引入①实时材质渲染②独立的高分辨率材质贴图层。

## 2. 目标与非目标

### 目标
- 把展示形态改为**单件沉浸式**：一次只展示一件衣服，铺满视口，可拖拽转台、可缩放。
- 引入**参数化材质系统**：同一套素材，靠光照与材质参数呈现不同面料。第一轮跑通「皮革」。
- 细节展示达到商业可用：微距热点 + 面料参数 + 顺/侧/逆三档光位对照。
- 架构素材无关：之后补针织、泰迪绒、以及用户的实拍/AI 生成图时，只改配置与素材，不改渲染器。

### 非目标（第一轮明确不做）
- 真 360° 转台（需要新的 120 帧级素材，属另一预算与周期）。
- 真皮草/毛皮的轮廓绒毛（需带毛边的实拍或生成素材）。
- 购物车、支付、库存、尺码、模特上身。
- 替换或重做 `pipeline/prepare.py` 的视频处理链路。

## 3. 关键决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 材质实现路线 | WebGL 着色器合成 | 唯一能在平面帧素材上消掉"挂牌感"的路线；CSS 伪光泽救不了僵硬，3D 布料重建喂不动现有素材 |
| 展示形态 | C 单件沉浸式 | 用户选定；也最适合材质对比 |
| 第一轮件数 | 1 件（tee → 皮革） | 遵循本项目"一件通过再扩展"的规则；皮革表面最平滑、最容易先跑通，风险最低 |
| 角度范围 | 90°（印花件）/ 180°（素色件镜像） | 素材客观限制；素色件无印花，镜像无破绽；印花件镜像会反字，禁止 |
| 材质贴图来源 | Python 程序化生成 1024² 无缝贴图 | 绕开 384×448 的分辨率死结；生成的是真纹理而非放大糊图 |
| 服装级法线 | 着色器内实时求导 | 免去 30 帧法线图集（省 20MB 显存），且永不与帧不同步 |
| 渲染上下文 | 单一 WebGL 上下文 + 单一视口 | C 形态只需一个视口，彻底避开浏览器多上下文上限 |
| 原挂杆体验 | 保留为 `rack.html` | 用户需要 A/B 对比；原体验已打磨完整，不应被删 |

## 4. 系统架构

### 4.1 模块

| 文件 | 职责 | 可测试性 |
|---|---|---|
| `src/turntable.js` | 拖拽位移 → 转台值映射、钳制、惯性衰减、镜像判定 | 纯函数，单测 |
| `src/lens.js` | 缩放 1×–3× 钳制、指针锚定缩放、平移边界 | 纯函数，单测 |
| `src/material-library.js` | 材质预设（参数集 + uniform 打包 + 参数校验） | 纯函数，单测 |
| `src/detail-points.js` | 细节热点归一化坐标 → 屏幕命中测试 | 纯函数，单测 |
| `src/webgl-stage.js` | WebGL2 上下文、着色器编译、纹理上传、逐帧绘制 | 集成 |
| `src/stage-app.js` | 沉浸式页面编排：输入、RAF、UI 绑定、降级 | 集成 |
| `src/stage.css` | 沉浸式舞台样式 | — |
| `index.html` | 沉浸式舞台入口（重写） | — |
| `rack.html` | 原挂杆体验，原样迁移 | — |
| `pipeline/textures.py` | 程序化材质贴图 + 细节裁切生成 | 单测（Python） |

`src/controller.js`、`src/rack-layout.js`、`src/mobile-rail.js`、`src/app.js` 均不改动，由 `rack.html` 继续使用。

### 4.2 转台取值定义（关键：先定死，避免实现期歧义）

| 场景 | 取值范围 | 帧索引 | 镜像 |
|---|---|---|---|
| 素色件（`mirror: true`） | `v ∈ [-1, +1]` | `frame = round(|v| × (frameCount-1))` | `v < 0` 时水平翻转 |
| 印花件（无 `mirror`） | `v ∈ [0, +1]` | `frame = round(v × (frameCount-1))` | 从不 |

- 素色件：`v = 0` 为正面，`v = ±1` 为两侧侧影 → 一条连续的 180° 转台，正面居中。
- 印花件：`v = 0` 为侧影，`v = 1` 为正面（与素材原始弧一致）。
- 初始值：素色件 `v = 0`（正面开场），印花件 `v = 1`。

### 4.3 渲染管线

单帧绘制流程：

```
atlas 纹理（整张 2304×2240 上传一次，用 UV 偏移选帧）
  ↓ frame 由 4.2 的 v 决定；|v| 的小数部分用于与相邻帧交叉淡入（窗口 ±0.35 帧）
albedo（RGBA，alpha 即轮廓遮罩；mirror 时 u 轴翻转）
  ↓ 乘以材质 tint
  ↓ 叠加材质 grain 贴图（1024²，UV 平铺 grainScale 次，soft-light 混合）
  ↓ 服装级法线：由 albedo 亮度做 4 抽样梯度实时求导（乘 frameNormalStrength）
  ↓ 与材质粒面法线（grain → normal map）合成
光照：Lambert 漫反射 + GGX 高光 + 皮革专用柔光箱环境高光
  ↓ 顶点位移（布料二次运动，以悬挂点为权重的低频波，幅度 ±2–4px）
输出到唯一视口
```

### 4.4 着色器光照模型

- 主光方向由**光位档位**决定，并叠加指针引起的 ±8° 微漂移与缓慢自漂移，让高光"活"起来。
- 皮革专用：程序化柔光箱环境——在反射方向附近放置一块矩形软光源，产生真实皮革特有的**矩形高光带**。这是让皮革"看起来贵"的核心手段。
- 着色器预留 `sheen`（Charlie/Kajiya-Kay 绒光）与 `anisotropy` 通道；第一轮皮革两者取 0，不启用。

## 5. 皮革材质规格（第一轮唯一材质）

| 参数 | 值 | 说明 |
|---|---|---|
| `tint` | `#2b2118` 深咖啡 | 与 tee 素材的米白色相乘得到深色皮革 |
| `roughness` | 0.28 | 窄而锐的高光 |
| `specular` | 1.00 | 强镜面 |
| `normalStrength` | 0.55 | 粒面颗粒清晰但不夸张 |
| `frameNormalStrength` | 0.35 | 服装大形起伏的参与度 |
| `grainScale` | 8.0 | 粒面在 UV 上的平铺次数（视觉调校值） |
| `sheen` | 0.00 | 皮革无绒光 |
| `anisotropy` | 0.00 | 皮革无方向性 |
| `envSoftbox` | 1.00 | 柔光箱反射强度 |
| `fuzz` | 0.00 | 无绒毛轮廓 |
| `translucency` | 0.00 | 皮革完全不透光 |
| `displacement` | 0.25 | 形变小、硬挺 |
| `creaseSharpness` | 0.85 | 折痕锐利 |

### 贴图生成（`pipeline/textures.py`）

1. `leather-grain.webp`（1024²，灰度，lossless）：Voronoi/细胞噪声生成鹅卵石状粒面，叠加细裂纹网络，边缘做局部模糊得到粒面起伏。
2. `leather-normal.webp`（1024²，RGB，lossless）：由 grain 高度场经 Sobel 转法线。
3. 两者**无缝（tileable）**：生成在环绕边界上做周期化处理，接缝不可见。
4. 固定随机种子 → 可重复生成，便于审计与复现。
5. 输出到 `public/fixtures/tee/materials/leather/`，并在同目录写 `material.json` 记录种子、算法版本、派生来源（如实标注"程序化生成，非实拍"）。

## 6. 交互规格

| 操作 | 行为 | 数值 |
|---|---|---|
| 鼠标/触摸横向拖拽 | 转台无级 scrub | 素色件 180° 对应 `min(视口宽 × 0.85, 1400px)`；印花件 90° 同公式 |
| 松手 | 惯性滑行，阻尼衰减，触边即停 | 复用 `slideStep` 思路，`omega = 22` |
| 转台边界 | 硬钳制，不越界不回弹 | 素色件 `[-1, 1]`，印花件 `[0, 1]` |
| 滚轮 / 双指捏合 | 缩放 1.0×–3.0× | `deltaY × 0.0012`，钳制后平滑 |
| 缩放锚点 | **指针下的点保持不动** | 由 `lens.js` 解算平移 |
| 平移边界 | 放大后可拖移画面，但不拖出衣服 | 内容边界 + 12px 余量 |
| 光位按钮 | 顺光 / 侧光 / 逆光 | 主光方位角 −35° / 0° / +150°，仰角 25° |
| 细节热点 | 点击弹出局部微距面板 | 见第 7 节 |
| `←` / `→` | 转台步进 | 15°；`Shift` 修饰时 1 帧（3°） |
| `+` / `-` | 缩放步进 | 0.25× |
| `1` / `2` / `3` | 光位切换 | — |
| `Esc` | 关闭微距面板，其次重置缩放 | — |

**自动淡出**：指针静止 3 秒后，信息条与控件淡至 12% 不透明度；任意输入恢复。仅淡出视觉，不移除可访问性。

## 7. 细节展示

- **微距热点**：`tee` 上预设 4 个热点——领口、袖口折边、下摆车线、皮革粒面。点击后在右侧滑出面板，显示该处 3× 裁切 + 名称 + 说明。
- **微距裁切**：由 `pipeline/textures.py` 从最佳帧裁切，2× Lanczos + 轻度非锐化。**如实标注"源自 384×448 预览素材"**，不冒充实拍。
- **面料参数表**：成分、克重、厚度、表面处理、垂感、护理建议，数据来自 `fabric` 字段。
- **光位对照**：不新增素材，纯着色器实现，是拉开材质差异最有效的手段。

## 8. 数据契约

`config/catalog.json` 新增顶层 `stage` 与每件的可选 `material` / `fabric` / `details` / `mirror`（**旧字段与旧配置仍然有效**）：

```json
{
  "title": "…",
  "stage": {"item": "tee"},
  "items": [
    {
      "id": "tee",
      "name": "Leather tee",
      "type": "短袖",
      "color": "Espresso",
      "motion": "fixtures/tee/manifest.json",
      "description": "…",
      "mirror": true,
      "material": {
        "preset": "leather",
        "tint": "#2b2118",
        "grain": "fixtures/tee/materials/leather/leather-grain.webp",
        "normal": "fixtures/tee/materials/leather/leather-normal.webp",
        "params": {"roughness": 0.28, "specular": 1.0, "normalStrength": 0.55, "frameNormalStrength": 0.35, "grainScale": 8.0, "sheen": 0.0, "anisotropy": 0.0, "envSoftbox": 1.0, "fuzz": 0.0, "translucency": 0.0, "displacement": 0.25, "creaseSharpness": 0.85}
      },
      "fabric": {
        "composition": "Full-grain lambskin", "weightGsm": 780, "thickness": "0.9 mm",
        "finish": "Semi-aniline", "drape": "Structured", "care": "专业皮革护理，避水避晒"
      },
      "details": [
        {"id": "collar", "label": "领口", "x": 0.5, "y": 0.115, "crop": "fixtures/tee/details/collar.webp", "note": "双针车线，螺纹收口"}
      ]
    }
  ]
}
```

`validateCatalog` 新增校验（保持向后兼容）：

- `stage.item` 若存在，必须是已存在的 item id
- `material.grain` / `material.normal` / `details[].crop` 走现有 `localAsset()` 路径安全校验
- `material.tint` 必须匹配 `^#[0-9a-f]{6}$`
- `params` 各值必须是 `[0, 4]` 闭区间内的有限数；未知参数键直接报错（防止拼写错误静默失效）
- `fabric.weightGsm` 为 0–5000 的有限数
- `details` 最多 8 条，`x`/`y` 在 `[0,1]`，`id` 匹配 `^[a-z0-9-]+$` 且在件内唯一
- `mirror` 必须为布尔；若为 `true` 而该件存在印花素材，构建期给出警告（不阻断）

**连带影响**：`tee` 被加入 catalog 后，`rack.html` 会从 2 件变 3 件。这是可接受的（原体验本身支持多件，且用户已看过 2 件版本）。

## 9. 服务端、审计与构建

这三处都有硬约束，必须同步改，否则新页面在本地或产物里直接 404：

| 文件 | 改动 | 原因 |
|---|---|---|
| `scripts/serve.mjs` | 允许列新增 `rack.html` | 现有正则只白名单 `index.html`，新页面会被 404 |
| `scripts/build.mjs` | 拷贝清单新增 `rack.html` | 否则 `dist/` 里没有对比页 |
| `scripts/audit.mjs` | 文件清单新增 `rack.html` | 保证新页面也参与凭证/机器路径扫描 |
| `tests/server.test.mjs` | 新增 `rack.html`、材质贴图、细节裁切的 200/404 断言 | 允许列表是安全边界，改了必须测 |

现规则 `public/(fixtures/[a-z0-9/-]+\.(webp|json|jpg))` 已覆盖 `materials/` 与 `details/` 子目录，无需改正则，但**必须有测试固定住**。

不允许通过服务暴露：`review/`、`work/`、`inputs/`、`generated/`、`pipeline/`、`docs/superpowers/`。

## 10. 性能预算

| 项 | 预算 |
|---|---|
| GPU 纹理内存 | atlas 2304×2240 RGBA ≈ 20.6 MB + 2×1024² ≈ 8 MB ≈ **29 MB** |
| 首屏传输 | atlas 199 KB + 材质贴图 ≤ 900 KB ≈ **1.1 MB** |
| 目标帧率 | 1080p 独显 ≥ 60 fps，集显 ≥ 45 fps |
| 单帧 draw call | 1 |
| 全屏放大倍率 | 448px → 约 886px ≈ **1.98×**（素材硬上限，见第 12 节） |

贴图压缩：grain 与 normal 均用 lossless webp；若单张超 500 KB，降到 768² 后重新评估无缝性与粒面尺度。

## 11. 降级与无障碍

- **WebGL2 不可用** → 提示"当前环境不支持材质渲染"并提供跳转 `rack.html` 的入口。
- **`prefers-reduced-motion: reduce`** → 关闭布料位移、关闭惯性、关闭光漂移；保留拖拽、缩放、光位切换。
- **触摸设备** → 单指拖拽转台，双指捏合缩放，互不冲突。
- **键盘完整等价**：转台、缩放、光位、热点、面板关闭全部有键位。
- **读屏**：`aria-live="polite"` 播报当前角度区段（左侧 / 正面 / 右侧）与当前材质、光位。
- 热点用真实 `<button>`，有 `aria-label`。

## 12. 风险与诚实限制

1. **轮廓锐度**：全屏放大 1.98×，衣物轮廓边缘必然偏软。材质层能救回面料质感，**救不回轮廓**。要真正锐利需 ≥1024px 的新素材。
2. **角度**：真 360° 不可达。素色件镜像到 180°，印花件锁 90°。镜像在纯素色件上视觉无破绽，但**技术上不是真实另一侧**——这一点会写进页面说明与文档，不隐瞒。
3. **皮革非实拍**：粒面为程序化生成，与真实小羊皮存在可辨差异。第一轮目标是"材质分级的可信观感"，不是"以假乱真"。
4. **毛皮上限**：泰迪绒可用着色器 fuzz + 边缘侵蚀近似；真皮草必须实拍或生成素材，不在第一轮承诺。
5. **性能长尾**：集显 + 高 DPI 屏是最大风险点，需实测而非假设。

## 13. 测试与验收

### 自动化
- `node --test tests/runtime.test.mjs tests/server.test.mjs tests/ltx.test.mjs` 全绿（现有契约不得回归）
- 新增 `tests/stage.test.mjs`：`turntable` 的钳制/惯性/镜像判定、`lens` 锚点缩放数学、`material-library` 参数校验（含未知键拒绝）、`detail-points` 命中测试、`validateCatalog` 新字段的接受与拒绝
- `python -m unittest discover -s tests -p "test_*.py"` 全绿
- 新增 `tests/test_textures.py`：无缝性（左右/上下边界像素差 < 阈值）、法线图取值范围合法、同种子重复生成字节一致
- `node scripts/audit.mjs`、`node scripts/build.mjs` 通过

### 人工验收（真实浏览器逐项截图留档到 `review/`）
1. 1080p 拖拽全弧，帧变化连续、无跳帧、无越界
2. 缩放到 3× 时指针下的点确实不动
3. 三档光位切换，皮革高光带位置与形态符合预期
4. 逆光档下皮革不透光（未来泰迪绒应透光，作为对照基准）
5. 四个微距热点全部命中，面板内容正确
6. 键盘全流程可完成
7. `prefers-reduced-motion` 下无位移无惯性
8. 窄屏（390px）触摸拖拽与捏合
9. `rack.html` 原体验完全不受影响（含新增的第三件）

## 14. 后续扩展路径

| 轮次 | 内容 | 改动面 |
|---|---|---|
| 第二轮 | 针织（`crew`）：线圈贴图 + 各向异性 + 微透光 | 只加 `material-library` 预设 + 贴图生成函数 + catalog 条目 |
| 第三轮 | 泰迪绒（`hoodie`）：绒簇贴图 + fuzz 轮廓 + 透光 | 同上，启用着色器预留通道 |
| 第四轮 | 原两件印花件接入沉浸式 | 关 `mirror`，锁 90° |
| 素材升级 | 用户实拍 / AI 生成高清图 | 替换 `atlas`/`front`/`back` 与材质贴图来源，渲染器不动 |

## 15. 交付物

- `index.html`（重写为沉浸式）、`rack.html`（原体验迁移）
- `src/turntable.js`、`src/lens.js`、`src/material-library.js`、`src/detail-points.js`、`src/webgl-stage.js`、`src/stage-app.js`、`src/stage.css`
- `pipeline/textures.py` + `tests/test_textures.py`
- `tests/stage.test.mjs`
- `public/fixtures/tee/materials/leather/*`、`public/fixtures/tee/details/*`
- `config/catalog.json` 更新
- `scripts/serve.mjs`、`scripts/build.mjs`、`scripts/audit.mjs`、`tests/server.test.mjs` 同步更新
- 本文档
