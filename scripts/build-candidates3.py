# -*- coding: utf-8 -*-
# Apple 系统风：白色立体 T 字 + 三种全新底色
import os
os.makedirs('build/icon-candidates', exist_ok=True)

def build(name, gid, stops, shadow_color, shadow_opacity):
    bg_stops = ''.join('<stop offset="%s" stop-color="%s"/>' % (o, s) for s, o in stops)
    defs = (
        '    <linearGradient id="bg' + gid + '" x1="80" y1="20" x2="440" y2="500" gradientUnits="userSpaceOnUse">' + bg_stops + '</linearGradient>\n'
        '    <radialGradient id="halo' + gid + '" cx="0.5" cy="0.32" r="0.7">\n'
        '      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>\n'
        '    </radialGradient>\n'
        '    <linearGradient id="tletter" x1="0" y1="0" x2="0" y2="1">\n'
        '      <stop stop-color="#FFFFFF"/><stop offset=".62" stop-color="#FDF9F2"/><stop offset="1" stop-color="#EBDFCE"/>\n'
        '    </linearGradient>\n'
        '    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">\n'
        '      <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="' + shadow_color + '" flood-opacity="' + shadow_opacity + '"/>\n'
        '    </filter>\n'
        '    <clipPath id="tclip"><path d="M136 180c0-17.7 14.3-32 32-32h176c17.7 0 32 14.3 32 32v0c0 17.7-14.3 32-32 32h-56v188c0 17.7-14.3 32-32 32h0c-17.7 0-32-14.3-32-32V212h-56c-17.7 0-32-14.3-32-32Z"/></clipPath>'
    )
    body = (
        '  <rect width="512" height="512" rx="118" fill="url(#bg' + gid + ')"/>\n'
        '  <rect width="512" height="512" rx="118" fill="url(#halo' + gid + ')"/>\n'
        '  <g filter="url(#soft)">\n'
        '    <path d="M136 180c0-17.7 14.3-32 32-32h176c17.7 0 32 14.3 32 32v0c0 17.7-14.3 32-32 32h-56v188c0 17.7-14.3 32-32 32h0c-17.7 0-32-14.3-32-32V212h-56c-17.7 0-32-14.3-32-32Z" fill="url(#tletter)"/>\n'
        '  </g>\n'
        '  <g clip-path="url(#tclip)">\n'
        '    <rect x="100" y="300" width="320" height="140" fill="#8A5A20" opacity=".12"/>\n'
        '    <rect x="60" y="96" width="440" height="86" rx="43" fill="#FFFFFF" opacity=".5" transform="rotate(-16 280 140)"/>\n'
        '  </g>'
    )
    return wrap(defs, body)

def wrap(defs, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">\n'
            '  <defs>\n' + defs + '\n  </defs>\n' + body + '\n</svg>')

# 三种全新底色
candidates = [
    ('S1-sunset', '1', [('#FFC24B', '0'), ('#FF7A45', '.52'), ('#E8386D', '1')], '#7A1E3C', '.4'),
    ('S2-ink', '2', [('#3A3F47', '0'), ('#22262C', '.55'), ('#101318', '1')], '#000000', '.55'),
    ('S3-teal', '3', [('#0E7490', '0'), ('#115E59', '.55'), ('#134E4A', '1')], '#042F2E', '.45'),
]
for name, gid, stops, sc, so in candidates:
    open('build/icon-candidates/%s.svg' % name, 'w', encoding='utf-8').write(build(name, gid, stops, sc, so))
print('3 SVGs written')
