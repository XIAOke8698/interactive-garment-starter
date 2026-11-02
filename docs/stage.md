# 沉浸式材质展示台

`index.html` 是本项目的沉浸式单件展示页：一件衣服铺满视口，可拖拽转台、指针锚定缩放、三档光位切换，并带面料微距细节。原「挂杆 + 悬停转身」体验完整保留在 `rack.html`，两页共用同一份 `config/catalog.json`。

## 它解决什么问题

上游 starter 的衣服是预渲染的 30 帧透明图集（384×448/帧），前端逐帧播放。这带来三个硬限制：

1. 转身是纯刚性旋转，布料没有任何形变自由度 → 观感僵硬
2. 单帧只有 384×448，放大 3× 必然糊 → 做不了面料级细节
3. 素材只有一套"棉布"外观，无法表现不同材质

沉浸式舞台的做法是**在帧图集之上叠一层实时材质渲染**，而不是换素材：粒面、法线、高光、柔光箱反射、布料微动全部在着色器里合成。因此放大到 3× 时看到的面料纹理依然是锐利的——它来自独立的 1024² 材质贴图，不是被放大的模糊照片。

## 架构

| 文件 | 职责 |
|---|---|
| `src/turntable.js` | 拖拽位移 ↔ 转台值 ↔ 帧索引，含镜像与惯性（纯函数，有单测） |
| `src/lens.js` | 缩放钳制、指针锚定缩放、平移边界（纯函数，有单测） |
| `src/material-library.js` | 材质预设与参数校验（纯函数，有单测） |
| `src/detail-points.js` | 细节热点投影与命中测试（纯函数，有单测） |
| `src/webgl-stage.js` | WebGL2 上下文、着色器、纹理、单次绘制 |
| `src/stage-app.js` | 输入、RAF、UI 绑定、降级 |
| `pipeline/textures.py` | 程序化粒面/法线/打光样片与细节裁切生成 |

单一 WebGL 上下文、单一视口、每帧一次 draw call。

## 角度与镜像：必须先知道的限制

全部素材的角度弧都是「左侧影 → 正面」约 **90°**，不含背面与右侧。

- 素色件（`"mirror": true`）把这段弧镜像延展成 **180°**（`v ∈ [-1, 1]`，`v = 0` 是正面居中）。素色件没有印花，镜像看不出破绽，但**技术上不是真实的另一侧**。
- 印花件不镜像，只锁在 90°（`v ∈ [0, 1]`）。

真 360° 需要每件衣服约 120 帧的新素材（拍摄或生成），属于另一个预算与周期，当前未做。

## 数据契约

每件商品可选挂载材质、面料参数、细节热点（老字段与老配置照常工作）：

```json
{
  "id": "tee",
  "mirror": true,
  "material": {
    "preset": "leather",
    "tint": "#42301f",
    "grain": "fixtures/tee/materials/leather/leather-grain.webp",
    "normal": "fixtures/tee/materials/leather/leather-normal.webp"
  },
  "fabric": {"composition": "100% 小羊皮 · 全粒面", "weightGsm": 780},
  "details": [{"id": "collar", "label": "领口", "x": 0.5, "y": 0.145,
               "crop": "fixtures/tee/details/collar.webp", "note": "…"}]
}
```

顶层 `stage.item` 指定沉浸式页展示哪一件。

`validateCatalog` 会强制：材质参数区间、tint 必须是 `#rrggbb`、**未知参数键直接报错**（打错名字不会静默失效）、细节坐标在 `[0,1]`、路径必须在 `public/` 内。参数间的关系写在 `src/material-library.js` 的 `PARAM_RANGES`。

## 重新生成材质贴图

```sh
python pipeline/textures.py --item tee --material leather
```

已审阅的输出不会被覆盖，确认要重做时加 `--force`。生成固定种子，结果可复现。

产物（`public/fixtures/tee/`）：

```text
materials/leather/leather-grain.webp     粒面高度（1024²，无缝）
materials/leather/leather-normal.webp    由高度场转出的法线
materials/leather/leather-swatch.webp    细节面板用的打光样片
materials/leather/material.json          种子、算法版本、派生来源
details/{collar,cuff,hem}.webp           从正面帧裁切并 2× 放大
```

无缝性由 FFT 周期化噪声与环绕采样的 Worley 细胞保证，并由 `tests/test_textures.py` 断言（边界像素跳变必须小于内部典型步长的 3 倍）。

## 加一种新材质

材质系统是数据驱动的，加面料不需要动渲染器：

1. 在 `src/material-library.js` 的 `PRESETS` 增加预设（`knit` 与 `sherpa` 已预置参数，着色器里的 `sheen` / `anisotropy` / `fuzz` / `translucency` 通道就是为它们留的）
2. 在 `pipeline/textures.py` 增加对应的贴图生成函数，产出 grain / normal
3. 在 `config/catalog.json` 给某件商品的 `material.preset` 指向它

## 降级与无障碍

- 无 WebGL2 → 页面显示说明并提供跳转 `rack.html` 的入口，不会渲染出错误画面
- `prefers-reduced-motion: reduce` → 关闭布料位移、惯性、光漂移；拖拽、缩放、光位仍然可用
- 键盘：`←/→` 转台（`Shift` 精细），`+/-` 缩放，`1/2/3` 光位，`Esc` 关闭面板/复位
- 细节热点是真实 `<button>`，转台角度与光位通过 `aria-live` 播报

## 诚实的限制

1. **轮廓锐度**：384×448 素材铺满 1080p 约放大 1.98×，衣服边缘必然偏软。材质层救回面料质感，救不回轮廓。要真正锐利需要 ≥1024px 的新素材。
2. **皮革非实拍**：粒面是程序化合成，与真实小羊皮有可辨差异。目标是"材质分级的可信观感"，不是以假乱真。
3. **金色标尺**：目前的粒面尺度、高光宽度是按视觉调校的，不是物理测量值。
4. **平面插画素材**：`tee` / `crew` / `hoodie` 三套是无印花的平面插画，自身几乎没有明暗信息，衣服的体积感靠着色器从轮廓内推合成。换成真实拍摄的素材会明显更好。
