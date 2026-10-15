import type { ReactNode } from "react";
import "./brand-tokens.css";
import "./globals.css";

export const metadata = {
  title: "한이룸의 상세페이지 마법사 3.1",
  description: "제품 이미지를 업로드하면 AI가 상세페이지 구조와 섹션 이미지를 설계하고 고정 해상도로 내보내는 공개형 도구"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
