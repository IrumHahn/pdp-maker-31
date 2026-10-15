"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "./pdp-utils";
import { DEFAULT_WAITING_VIDEO, type WaitingVideo } from "./pdp-maker-client-support";

type FeedVideo = { videoId: string; title: string };

// 세션 동안 목록은 한 번만 받고, 대기 화면이 뜰 때마다 직전과 다른 영상을 고른다.
let feedPromise: Promise<FeedVideo[]> | null = null;
let lastVideoId = "";

function loadFeed(): Promise<FeedVideo[]> {
  if (!feedPromise) {
    feedPromise = fetch(`${API_BASE_URL}/pdp/waiting-videos`)
      .then(async (response) => {
        const payload = (await response.json()) as { ok: boolean; videos?: FeedVideo[] };
        return payload.ok && Array.isArray(payload.videos) ? payload.videos.filter((video) => video.videoId && video.title) : [];
      })
      .catch(() => []);
  }
  return feedPromise;
}

function toWaitingVideo(video: FeedVideo): WaitingVideo {
  return {
    videoId: video.videoId,
    title: video.title,
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
    embedUrl: `https://www.youtube.com/embed/${video.videoId}?rel=0&modestbranding=1`
  };
}

export function pickRandomWaitingVideo(videos: FeedVideo[]): WaitingVideo {
  const candidates = videos.length > 1 ? videos.filter((video) => video.videoId !== lastVideoId) : videos;
  if (!candidates.length) return DEFAULT_WAITING_VIDEO;
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  lastVideoId = chosen.videoId;
  return toWaitingVideo(chosen);
}

/** 대기 화면용 유튜브 프레임. 마운트될 때마다 채널 최근 영상 중 하나를 무작위로 보여준다. */
export function PdpWaitingVideoFrame() {
  const [video, setVideo] = useState<WaitingVideo | null>(null);
  useEffect(() => {
    let active = true;
    void loadFeed().then((videos) => { if (active) setVideo(pickRandomWaitingVideo(videos)); });
    return () => { active = false; };
  }, []);
  const current = video ?? DEFAULT_WAITING_VIDEO;
  return (
    <iframe
      key={current.videoId}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      loading="lazy"
      src={current.embedUrl}
      title={current.title}
    />
  );
}
