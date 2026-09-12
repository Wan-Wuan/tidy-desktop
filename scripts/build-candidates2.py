# -*- coding: utf-8 -*-
# 四个纯平大几何候选（青碧 + 橙，无滤镜阴影）
import os
os.makedirs('build/icon-candidates', exist_ok=True)

COMMON = '<radialGradient id="glow" cx="0.3" cy="0.12" r="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".18"/><stop offset=".6" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>'

def wrap(defs, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">\n'
            '  <defs>\n' + defs + '\n  </defs>\n' + body + '\n</svg>')

# ── 1 格 · 纯平磁贴网格 ──
s1 = wrap(
    '<linearGradient id="bg" x1="96" y1="40" x2="432" y2="480" gradientUnits="userSpaceOnUse">'
    '<stop stop-color="#14B8A6"/><stop offset="1" stop-color="#0F5F57"/></linearGradient>' + COMMON,
    '  <rect width="512" height="512" rx="118" fill="url(#bg)"/>\n'
    '  <rect width="512" height="512" rx="118" fill="url(#glow)"/>\n'
    '  <rect x="140" y="140" width="104" height="104" rx="28" fill="#FFFFFF"/>\n'
    '  <rect x="268" y="140" width="104" height="104" rx="28" fill="#F97316"/>\n'
    '  <rect x="140" y="268" width="104" height="104" rx="28" fill="#FFFFFF" opacity=".88"/>\n'
    '  <rect x="268" y="268" width="104" height="104" rx="28" fill="#FFFFFF" opacity=".72"/>'
)
open('build/icon-candidates/X1-flatgrid.svg', 'w', encoding='utf-8').write(s1)

# ── 2 框 · 相框收纳 ──
s2 = wrap(
    '<linearGradient id="bg" x1="96" y1="40" x2="432" y2="480" gradientUnits="userSpaceOnUse">'
    '<stop stop-color="#F0FDFA"/><stop offset="1" stop-color="#C7F0E6"/></linearGradient>' + COMMON,
    '  <rect width="512" height="512" rx="118" fill="url(#bg)"/>\n'
    '  <rect width="512" height="512" rx="118" fill="url(#glow)"/>\n'
    '  <rect x="98" y="98" width="316" height="316" rx="90" fill="none" stroke="#0F766E" stroke-width="42"/>\n'
    '  <rect x="188" y="188" width="60" height="60" rx="17" fill="#0D9488"/>\n'
    '  <rect x="264" y="188" width="60" height="60" rx="17" fill="#0D9488" opacity=".75"/>\n'
    '  <rect x="188" y="264" width="60" height="60" rx="17" fill="#0D9488" opacity=".55"/>\n'
    '  <rect x="264" y="264" width="60" height="60" rx="17" fill="#F97316"/>'
)
open('build/icon-candidates/X2-frame.svg', 'w', encoding='utf-8').write(s2)

# ── 3 行 · 对齐清单 ──
s3 = wrap(
    '<linearGradient id="bg" x1="96" y1="40" x2="432" y2="480" gradientUnits="userSpaceOnUse">'
    '<stop stop-color="#14B8A6"/><stop offset="1" stop-color="#0F5F57"/></linearGradient>' + COMMON,
    '  <rect width="512" height="512" rx="118" fill="url(#bg)"/>\n'
    '  <rect width="512" height="512" rx="118" fill="url(#glow)"/>\n'
    '  <rect x="128" y="136" width="256" height="60" rx="30" fill="#FFFFFF"/>\n'
    '  <rect x="128" y="226" width="180" height="60" rx="30" fill="#FFFFFF" opacity=".9"/>\n'
    '  <rect x="328" y="226" width="56" height="60" rx="20" fill="#F97316"/>\n'
    '  <rect x="128" y="316" width="256" height="60" rx="30" fill="#FFFFFF" opacity=".78"/>'
)
open('build/icon-candidates/X3-align.svg', 'w', encoding='utf-8').write(s3)

# ── 4 折 · 归整折角 ──
s4 = wrap(
    '<linearGradient id="bg" x1="96" y1="40" x2="432" y2="480" gradientUnits="userSpaceOnUse">'
    '<stop stop-color="#14B8A6"/><stop offset="1" stop-color="#0F5F57"/></linearGradient>' + COMMON,
    '  <rect width="512" height="512" rx="118" fill="url(#bg)"/>\n'
    '  <rect width="512" height="512" rx="118" fill="url(#glow)"/>\n'
    '  <path d="M136 184c0-26.5 21.5-48 48-48h144c26.5 0 48 21.5 48 48v96l-144 144h-48c-26.5 0-48-21.5-48-48Z" fill="#FFFFFF"/>\n'
    '  <path d="M376 280 232 424c30 0 96 0 96-48 0-48 0-72 48-96Z" fill="#F97316"/>\n'
    '  <rect x="176" y="180" width="160" height="20" rx="10" fill="#0D9488" opacity=".3"/>\n'
    '  <rect x="176" y="226" width="120" height="20" rx="10" fill="#0D9488" opacity=".2"/>'
)
open('build/icon-candidates/X4-fold.svg', 'w', encoding='utf-8').write(s4)
print('4 SVGs written')
