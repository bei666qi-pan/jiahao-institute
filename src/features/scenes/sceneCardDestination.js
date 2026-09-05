export function sceneCardDestination({ sceneId, shareUrl, origin }) {
  return new URL(shareUrl || `/play/${encodeURIComponent(sceneId)}`, origin).href;
}
