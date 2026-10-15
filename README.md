# 한이룸의 상세페이지 마법사 3.1

제품 사진·기존 상세페이지 캡처·PDF를 올리면 기획·카피 초안을 한 번에 쓰고, 편집기에서 구간별 통이미지를 만들어 1080px 폭 JPEG/ZIP으로 내보내는 로컬 도구입니다. 사용 가이드: https://irumhahn.com/guide/pdp-maker-3.1

## 설치 (로컬 실행)

```bash
git clone https://github.com/IrumHahn/pdp-maker-31.git
cd pdp-maker-31
corepack enable      # pnpm 이 없을 때 한 번
pnpm install
pnpm dev             # http://127.0.0.1:3002/pdp-maker
```

- Node.js 20 이상, pnpm 사용. `pnpm dev`/`pnpm build`는 설치된 pdfjs 버전의 PDF 워커를 먼저 동기화합니다.
- API 키는 앱 화면의 설정(AI 연결)에서 입력하며 브라우저에만 저장됩니다. `.env` 파일은 필요 없습니다.
- 검증: `pnpm typecheck`
- 업데이트: 폴더에서 `git pull && pnpm install`

## 3.1 사용자 안내

- 사전 지식 기능 삭제. 기존 별도 지식 저장값은 사용하거나 전송하지 않습니다.
- 네 가지 섹션 구성을 무료로 적용한 뒤 목적·문구를 검토하고 이미지 생성을 시작합니다.
- Gemini / OpenAI / Higgsfield 공급자와 출력 모드 선택을 분리했습니다. OpenAI Image 2.5 Sunburst/Flare, 품질 6단계를 작업에 저장합니다.
- 동시 생성 최대 2장, 장별 완료 반영, 시작 일시정지, 실패/응답 불명 구분과 재개. Gemini 인물 검증이 실패해도 추가 이미지를 자동 생성하지 않습니다.
- 자연어 수정/유지 조건, 현재 이미지 편집 참조, 이전 결과 되돌리기, 원본 고정 사진, 텍스트 레이어 편집.
- 3.0 IndexedDB 호환, 빠른 자동 저장, 키 없는 JSON 백업/새 작업 복원. 1080px 폭 JPEG/ZIP 출력.
- API 비용은 채팅 구독·도구 이용료·강의 수강료와 별개입니다. 가격은 공식 출처를 확인하고 최종 청구는 공급자에서 확인합니다.

실제 유료 공급자의 상품 동일성·한글 품질·청구 비용과 판매자 베타 성공률은 출시 전 별도 검증이 필요합니다. 공개 다운로드/이용권/강의 가격은 운영자의 배포 안내를 기준으로 하며 임의로 정하지 않았습니다. 디자인 시안과 CSS는 Claude Code 작업 영역입니다.

## Bug Report Notifications

New reports from the `/pdp-maker` floating bug-report widget are saved to `output/bug-reports/*.jsonl`.
Admin status changes and internal notes are appended to `output/bug-reports/_admin-events.jsonl`, then merged into the admin list at render time.

Optional production notification environment variables:

- `PDP_BUG_REPORT_DISCORD_WEBHOOK_URL`: Discord triage webhook URL.
- `RESEND_API_KEY`: Resend API key for email notifications.
- `PDP_BUG_REPORT_EMAIL_FROM`: Verified sender email address.
- `PDP_BUG_REPORT_NOTIFY_EMAIL_TO`: Operator email recipient. Comma-separated recipients are supported.
- `PDP_MAKER_BASE_URL`: Public app origin used in admin links.
- `PDP_BUG_REPORT_ADMIN_TOKEN`: Optional production token for `/pdp-maker/admin/bug-reports`. Use the admin login form; the token is not kept in page URLs.
- `PDP_BUG_REPORT_REPLY_TO`: Optional reply-to address for customer status-update emails. Falls back to `PDP_BUG_REPORT_NOTIFY_EMAIL_TO`.
