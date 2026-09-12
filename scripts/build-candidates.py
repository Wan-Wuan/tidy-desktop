# -*- coding: utf-8 -*-
# 生成四个"彩色磁贴"方向的候选 SVG（与应用实际内容对应）
import os
os.makedirs('build/icon-candidates', exist_ok=True)

def bg_defs(gid, top, bottom):
    return (
        '    <linearGradient id="bg' + gid + '" x1="80" y1="30" x2="440" y2="490" gradientUnits="userSpaceOnUse">\n'
        '      <stop stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/>\n'
        '    </linearGradient>\n'
        '    <radialGradient id="glow' + gid + '" cx="0.3" cy="0.12" r="1">\n'
        '      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset=".6" stop-color="#FFFFFF" stop-opacity="0"/>\n'
        '    </radialGradient>'
    )

TILES = {
    'red': ('#FF7A6E', '#E8483C'), 'orange': ('#FFB25C', '#F08C1F'),
    'yellow': ('#FFD666', '#F2B419'), 'green': ('#7ED957', '#3DB54A'),
    'teal': ('#4FD8C8', '#18A995'), 'blue': ('#6DB5FF', '#2F7BFF'),
    'violet': ('#B78CFF', '#8146E8'), 'pink': ('#FF8FC5', '#E8469C'),
    'gold': ('#FFE08A', '#F2B419'),
}

def tile_defs():
    out = []
    for name, (top, bottom) in TILES.items():
        out.append(
            '    <linearGradient id="t-' + name + '" x1="0" y1="0" x2="1" y2="1">\n'
            '      <stop stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/>\n'
            '    </linearGradient>'
        )
    return chr(10).join(out)

SHADOW = (
    '    <filter id="ts" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">\n'
    '      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#2B2822" flood-opacity=".25"/>\n'
    '    </filter>'
)

def svg_wrap(defs, body):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">\n'
        '  <defs>\n' + defs + '\n  </defs>\n' + body + '\n</svg>'
    )

# V1: 3x3 彩色微磁贴，中央白玻璃块 + 金色星芒
cell, gap = 118, 18
x0 = (512 - 3 * cell - 2 * gap) // 2
colors = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink', 'gold']
tiles_v1 = []
for i, name in enumerate(colors):
    row, col = divmod(i, 3)
    x = x0 + col * (cell + gap)
    y = x0 + row * (cell + gap)
    tiles_v1.append('  <rect x="%d" y="%d" width="%d" height="%d" rx="30" fill="url(#t-%s)"/>' % (x, y, cell, cell, name))
cx = x0 + cell + gap
tiles_v1[4] = '  <rect x="%d" y="%d" width="%d" height="%d" rx="30" fill="#FFFFFF" opacity=".92"/>' % (cx, cx, cell, cell)
tiles_v1.insert(5, '  <path d="M%d %dc4.4 16.6 8.2 20.4 24.8 24.8-16.6 4.4-20.4 8.2-24.8 24.8-4.4-16.6-8.2-20.4-24.8-24.8 16.6-4.4 20.4-8.2 24.8-24.8Z" fill="#F2B419"/>' % (cx + 59, cx + 28))
v1 = svg_wrap(
    bg_defs('1', '#FBFAF6', '#ECE8DE') + '\n' + tile_defs() + '\n' + SHADOW,
    '  <rect width="512" height="512" rx="118" fill="url(#bg1)"/>\n'
    '  <rect width="512" height="512" rx="118" fill="url(#glow1)"/>\n'
    '  <rect x="13" y="13" width="486" height="486" rx="107" fill="none" stroke="#8A8273" stroke-opacity=".22" stroke-width="2"/>\n'
    '  <g filter="url(#ts)">\n' + chr(10).join(tiles_v1) + '\n  </g>'
)
open('build/icon-candidates/V1-mosaic.svg', 'w', encoding='utf-8').write(v1)

# V2: 2x2 大磁贴，金色块悬浮升起
v2 = svg_wrap(
    bg_defs('2', '#F7F5EF', '#E9E4D8') + '\n'
    + '    <linearGradient id="t-red" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FF8578"/><stop offset="1" stop-color="#E8483C"/></linearGradient>\n'
    + '    <linearGradient id="t-teal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#55DCCB"/><stop offset="1" stop-color="#18A995"/></linearGradient>\n'
    + '    <linearGradient id="t-blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#74B9FF"/><stop offset="1" stop-color="#2F7BFF"/></linearGradient>\n'
    + '    <linearGradient id="t-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFD666"/><stop offset="1" stop-color="#F2A419"/></linearGradient>\n'
    + '    <filter id="ts" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">\n'
    + '      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#2B2822" flood-opacity=".28"/>\n    </filter>\n'
    + '    <filter id="lift" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">\n'
    + '      <feDropShadow dx="0" dy="26" stdDeviation="20" flood-color="#2B2822" flood-opacity=".32"/>\n    </filter>',
    '  <rect width="512" height="512" rx="118" fill="url(#bg2)"/>\n'
    '  <rect width="512" height="512" rx="118" fill="url(#glow2)"/>\n'
    '  <rect x="13" y="13" width="486" height="486" rx="107" fill="none" stroke="#8A8273" stroke-opacity=".22" stroke-width="2"/>\n'
    '  <g filter="url(#ts)">\n'
    '    <rect x="116" y="130" width="126" height="126" rx="32" fill="url(#t-red)"/>\n'
    '    <rect x="270" y="274" width="126" height="126" rx="32" fill="url(#t-teal)"/>\n'
    '    <rect x="116" y="274" width="126" height="126" rx="32" fill="url(#t-blue)"/>\n'
    '  </g>\n'
    '  <ellipse cx="330" cy="352" rx="64" ry="14" fill="#2B2822" opacity=".18"/>\n'
    '  <g filter="url(#lift)">\n'
    '    <rect x="266" y="112" width="132" height="132" rx="34" fill="url(#t-gold)" transform="rotate(8 332 178)"/>\n'
    '    <path d="M332 142c4.8 18 9 22.2 27 27-18 4.8-22.2 9-27 27-4.8-18-9-22.2-27-27 18-4.8 22.2-9 27-27Z" fill="#FFFFFF" opacity=".95"/>\n'
    '  </g>'
)
open('build/icon-candidates/V2-float.svg', 'w', encoding='utf-8').write(v2)

# V3: 精修迷你窗口（浅色高级版）
v3 = svg_wrap(
    bg_defs('3', '#F8F6F0', '#EAE5DA') + '\n'
    + '    <linearGradient id="win" x1="110" y1="110" x2="402" y2="402" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#EFECE2"/></linearGradient>\n'
    + '    <linearGradient id="t-red" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FF8578"/><stop offset="1" stop-color="#E8483C"/></linearGradient>\n'
    + '    <linearGradient id="t-teal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#55DCCB"/><stop offset="1" stop-color="#18A995"/></linearGradient>\n'
    + '    <linearGradient id="t-blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#74B9FF"/><stop offset="1" stop-color="#2F7BFF"/></linearGradient>\n'
    + '    <linearGradient id="t-orange" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFB25C"/><stop offset="1" stop-color="#F08C1F"/></linearGradient>\n'
    + '    <filter id="ts" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">\n'
    + '      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#2B2822" flood-opacity=".26"/>\n    </filter>',
    '  <rect width="512" height="512" rx="118" fill="url(#bg3)"/>\n'
    '  <rect width="512" height="512" rx="118" fill="url(#glow3)"/>\n'
    '  <rect x="13" y="13" width="486" height="486" rx="107" fill="none" stroke="#8A8273" stroke-opacity=".22" stroke-width="2"/>\n'
    '  <g filter="url(#ts)">\n'
    '    <rect x="106" y="106" width="300" height="300" rx="44" fill="url(#win)" stroke="#8A8273" stroke-opacity=".25" stroke-width="2"/>\n'
    '    <circle cx="142" cy="142" r="8" fill="#FF6B5F"/>\n'
    '    <circle cx="170" cy="142" r="8" fill="#FFCA58"/>\n'
    '    <circle cx="198" cy="142" r="8" fill="#65D36E"/>\n'
    '    <rect x="134" y="176" width="106" height="90" rx="22" fill="url(#t-red)"/>\n'
    '    <rect x="272" y="176" width="106" height="90" rx="22" fill="url(#t-teal)"/>\n'
    '    <rect x="134" y="292" width="106" height="90" rx="22" fill="url(#t-blue)"/>\n'
    '    <rect x="272" y="292" width="106" height="90" rx="22" fill="url(#t-orange)"/>\n'
    '  </g>\n'
    '  <circle cx="392" cy="378" r="46" fill="#F7F2E4"/>\n'
    '  <circle cx="392" cy="378" r="38" fill="#3DB54A"/>\n'
    '  <path d="M374 378l13 13 24-26" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'
)
open('build/icon-candidates/V3-window.svg', 'w', encoding='utf-8').write(v3)

# V4: 3x3 网格八浅一彩，金色块带轨迹落入空位
v4_tiles = []
for i in range(9):
    row, col = divmod(i, 3)
    if i == 8:
        continue
    x = x0 + col * (cell + gap)
    y = x0 + row * (cell + gap)
    v4_tiles.append('  <rect x="%d" y="%d" width="%d" height="%d" rx="30" fill="#DFD9CB"/>' % (x, y, cell, cell))
v4 = svg_wrap(
    bg_defs('4', '#F8F6F0', '#E9E4D8') + '\n'
    + '    <linearGradient id="t-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFD666"/><stop offset="1" stop-color="#F2A419"/></linearGradient>\n'
    + '    <filter id="lift" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">\n'
    + '      <feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="#2B2822" flood-opacity=".3"/>\n    </filter>',
    '  <rect width="512" height="512" rx="118" fill="url(#bg4)"/>\n'
    '  <rect width="512" height="512" rx="118" fill="url(#glow4)"/>\n'
    '  <rect x="13" y="13" width="486" height="486" rx="107" fill="none" stroke="#8A8273" stroke-opacity=".22" stroke-width="2"/>\n'
    + chr(10).join(v4_tiles) + '\n'
    '  <path d="M300 140c40-28 92-30 134-6" fill="none" stroke="#C9BFA6" stroke-width="12" stroke-linecap="round" stroke-dasharray="2 28"/>\n'
    '  <g filter="url(#lift)">\n'
    '    <rect x="300" y="300" width="130" height="130" rx="34" fill="url(#t-gold)" transform="rotate(10 365 365)"/>\n'
    '    <path d="M365 330c4.6 17.4 8.7 21.4 26.1 26.1-17.4 4.6-21.4 8.7-26.1 26.1-4.6-17.4-8.7-21.4-26.1-26.1 17.4-4.6 21.4-8.7 26.1-26.1Z" fill="#FFFFFF" opacity=".95"/>\n'
    '  </g>'
)
open('build/icon-candidates/V4-slot.svg', 'w', encoding='utf-8').write(v4)
print('4 SVGs written')
