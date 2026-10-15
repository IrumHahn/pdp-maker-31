import type { Metadata } from "next";
import { PdpMakerClient } from "./PdpMakerClient";
import "./pdp-design-tokens.css";

export const metadata: Metadata = {
  title: "한이룸의 상세페이지 마법사 3.1",
  description: "제품 이미지를 업로드하면 AI가 상세페이지 구조와 섹션 이미지를 설계하고 고정 해상도로 내보내는 공개형 도구",
  icons: {
    icon: "/pdp-maker/icon.svg",
    shortcut: "/pdp-maker/icon.svg"
  }
};

export default function PdpMakerPage() {
  return <PdpMakerClient />;
}
