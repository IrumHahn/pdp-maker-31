#!/usr/bin/env bash
# 배포용 소스 내보내기 — 이 폴더는 git 저장소가 아니므로, 공개 GitHub(IrumHahn/pdp-maker-31)에 올릴 파일만
# 별도 폴더로 복사한다. 비밀값(.env*), 내부 기록(logs/STATE/DECISIONS/협업 로그), 실행 결과(output/test-results),
# 보관본(archive/backups), 게임(standalone-game), 테스트 캡처는 제외한다.
# 사용: scripts/export-source.sh <목적지 폴더>   (목적지에는 .git 이 있을 수 있음 — 그대로 보존)
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:?목적지 폴더를 지정하세요}"
mkdir -p "$DEST"
rsync -a --delete \
  --exclude '.git' --exclude '.claude' --exclude '.playwright-cli' --exclude '.playwright-mcp' --exclude '.run' --exclude '.wrangler' \
  --exclude '.env' --exclude '.env.*' \
  --exclude 'node_modules' --exclude '.next' --exclude '.vercel' \
  --exclude 'output' --exclude 'test-results' --exclude '*.tsbuildinfo' --exclude '.DS_Store' \
  --exclude 'archive' --exclude 'backups' --exclude 'logs' --exclude 'standalone-game' \
  --exclude 'docs' --exclude 'scripts/game' \
  --exclude 'AGENT_COLLAB_LOG.md' --exclude 'AGENTS.md' --exclude 'CLAUDE.md' --exclude 'HIA-RULES.md' \
  --exclude 'STATE.md' --exclude 'DECISIONS.md' --exclude 'progress.md' \
  --exclude '*.gif' --exclude 'pdp-customer-review-*.png' \
  --exclude 'public/pdp-draft-import.html' \
  "$SRC/" "$DEST/"
# 비밀값 패턴이 남아 있으면 실패시킨다.
if grep -rnE '(sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|gho_[A-Za-z0-9]{30,}|re_[A-Za-z0-9]{20,}|discord\.com/api/webhooks/[0-9]+)' "$DEST" --exclude-dir=.git >/dev/null; then
  echo "비밀값 패턴 발견 — 내보내기 중단" >&2; exit 1
fi
echo "내보내기 완료: $DEST ($(find "$DEST" -type f -not -path '*/.git/*' | wc -l | tr -d ' ')개 파일)"
