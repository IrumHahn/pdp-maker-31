#!/usr/bin/env bash
# 브랜드 규칙 잔존 검사. 위반이 있으면 exit 1.
set -u
cd "$(dirname "$0")/.."
fail=0
if grep -nE "font-serif|serif:" app/globals.css tailwind.config.ts | grep -v "sans-serif"; then echo "FAIL: serif 잔존"; fail=1; fi
if grep -nE "#173247|#f6f1e7|#171a1f" app/globals.css app/pdp-maker/pdp-maker.module.css; then echo "FAIL: 토큰 외 하드코딩 브랜드 hex 잔존"; fail=1; fi
if ! grep -q "마" app/pdp-maker/icon.svg; then echo "FAIL: icon 마크 아님"; fail=1; fi
if ! grep -q 'brand-tokens.css' app/layout.tsx; then echo "FAIL: layout 토큰 import 없음"; fail=1; fi
tok_line=$(grep -n 'brand-tokens.css' app/layout.tsx | head -1 | cut -d: -f1); glb_line=$(grep -n 'globals.css' app/layout.tsx | head -1 | cut -d: -f1)
if [ -z "$tok_line" ] || [ -z "$glb_line" ] || [ "$tok_line" -ge "$glb_line" ]; then echo "FAIL: 토큰 import 순서"; fail=1; fi
if [ -e public/brand/hanirum-brand-tokens.css ]; then echo "FAIL: 토큰 사본 중복"; fail=1; fi
if ! grep -q "by 한이룸" app/pdp-maker/PdpMakerClient.tsx; then echo "FAIL: 보증 워드마크 없음"; fail=1; fi
[ $fail -eq 0 ] && echo "brand-check PASS"
exit $fail
