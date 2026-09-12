# -*- coding: utf-8 -*-
cards = [
  ("V1-mosaic", "V1 · 彩色磁贴墙", "与应用内容 1:1 对应：3×3 彩色应用磁贴 + 中央白玻璃星芒。最像启动器，鲜活友好。"),
  ("V2-float", "V2 · 悬浮归位", "四块大磁贴，金色块带投影悬浮升起。干净、灵动、留白高级。"),
  ("V3-window", "V3 · 整理完成窗口", "迷你应用窗口（红绿灯 + 四色磁贴）+ 绿色完成徽章。初版概念的高级重制。"),
  ("V4-slot", "V4 · 落入空位", "3×3 浅色网格，金色磁贴带轨迹落入最后一个空位。“整理”故事讲得最清楚。"),
]
card_html = []
for dirname, title, desc in cards:
    card_html.append('  <div class="card"><h2>%s</h2><p>%s</p>\n    <div class="row">\n'
                     '      <figure><img src="%s/icon-256.png" width="180"><figcaption>256</figcaption></figure>\n'
                     '      <figure><img src="%s/icon-48.png" width="48"><figcaption>48</figcaption></figure>\n'
                     '      <figure class="dark-bg"><img src="%s/icon-16.png" width="16"><figcaption>16</figcaption></figure>\n'
                     '    </div>\n  </div>' % (title, desc, dirname, dirname, dirname))
html = (
    '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n'
    '<title>图标候选 · 本项目方向</title>\n<style>\n'
    "  body { font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; background: linear-gradient(160deg,#EFEDE6,#E2DED2); margin: 0; padding: 40px; }\n"
    '  h1 { color: #2B2822; font-size: 22px; }\n'
    '  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 28px; max-width: 1400px; }\n'
    '  .card { background: #FFFFFF; border-radius: 20px; padding: 28px; box-shadow: 0 10px 34px rgba(43,40,34,.14); }\n'
    '  .card h2 { margin: 0 0 6px; font-size: 18px; color: #2B2822; }\n'
    '  .card p { margin: 0 0 20px; color: #77705F; font-size: 13px; min-height: 36px; }\n'
    '  .row { display: flex; align-items: flex-end; gap: 24px; }\n'
    '  .row figure { margin: 0; text-align: center; }\n'
    '  .row figcaption { font-size: 11px; color: #999; margin-top: 8px; }\n'
    '  .dark-bg { background: #1E293B; border-radius: 12px; padding: 8px; }\n'
    '</style>\n</head>\n<body>\n'
    '<h1>Tidy Desktop 图标候选 · 与项目内容直接对应（彩色应用磁贴）</h1>\n'
    '<div class="grid">\n' + chr(10).join(card_html) + '\n</div>\n</body>\n</html>'
)
open('build/icon-candidates/preview.html', 'w', encoding='utf-8').write(html)
print('preview updated')
