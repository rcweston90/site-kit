#!/usr/bin/env bash
# Draws the demo's showreel clip (public/samples/showreel.webm): eight seconds
# of paper, lines and two moving shapes, made up for the demo. Nothing is
# downloaded; it needs ffmpeg with libvpx-vp9 and freetype, and the Geist
# font that ships inside Next's own package.
set -euo pipefail
cd "$(dirname "$0")/.."
FONT=$(find ../../node_modules/.pnpm -name 'Geist-Regular.ttf' -path '*next*' | head -1)
[ -n "$FONT" ] || { echo "Geist-Regular.ttf not found; run pnpm install first." >&2; exit 1; }
line() { echo "drawbox=x=150:y=$1:w='min($2,max(0,(t-$3)*120))':h=10:color=0xCFC8B8@1:t=fill"; }
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0xF4F1EA:s=960x540:r=24:d=8" -vf "\
drawbox=x=120:y=150:w=300:h=380:color=0xFFFFFF@1:t=fill,\
drawbox=x=120:y=150:w=300:h=380:color=0xD8D2C4@1:t=2,\
$(line 190 240 0),$(line 222 240 0.5),$(line 254 200 1),$(line 286 240 1.5),$(line 318 120 2),\
drawbox=x='520+80*sin(t*0.9)':y='240+40*cos(t*1.3)':w=96:h=96:color=0x2F6FDB@0.85:t=fill,\
drawbox=x='640-60*sin(t*0.7)':y='330+30*sin(t*1.1)':w=150:h=12:color=0xE07A3F@0.9:t=fill,\
drawtext=fontfile=$FONT:text='Lena Ortiz':x=480:y=80:fontsize=40:fontcolor=0x1C1B19,\
drawtext=fontfile=$FONT:text='Showreel · fictional demo clip':x=480:y=128:fontsize=20:fontcolor=0x6B665C,\
drawtext=fontfile=$FONT:text='Field notes → decisions':x=480:y=440:fontsize=26:fontcolor=0x1C1B19:alpha='min(1,max(0,(t-3)/1))',\
drawtext=fontfile=$FONT:text='Made with ffmpeg for site-kit':x=480:y=478:fontsize=16:fontcolor=0x6B665C:alpha='min(1,max(0,(t-4.5)/1))'" \
  -c:v libvpx-vp9 -b:v 0 -crf 40 -pix_fmt yuv420p -an public/samples/showreel.webm
echo "Wrote public/samples/showreel.webm"
