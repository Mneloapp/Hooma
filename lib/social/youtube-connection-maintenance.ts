import "server-only";

import {
  claimSocialConnectionRefresh,
  completeSocialConnectionRefresh,
  decryptClaimedSocialToken,
  failSocialConnectionRefresh,
  loadYouTubePublishingConnection,
  type YouTubePublishingConnection,
} from "./connections";
import { isProviderAuthenticationFailure } from "./provider-client";
import {
  getYouTubeChannelIdentity,
  refreshYouTubeAccessToken,
} from "./providers/youtube-oauth";
import { refreshClaimedYouTubeConnection } from "./token-refresh-worker";

/**
 * YouTube access tokens are short-lived. The dedicated maintenance cron is a
 * baseline, while this exact-lease refresh closes the gap immediately before
 * publishing or analytics without ever broadening the publishing gate.
 */
export async function ensureYouTubePublishingConnection(
  now = new Date(),
): Promise<YouTubePublishingConnection> {
  let loadFailure: unknown;
  try {
    return await loadYouTubePublishingConnection(now);
  } catch (error) {
    loadFailure = error;
  }

  const claim = await claimSocialConnectionRefresh("youtube");
  if (!claim) throw loadFailure;
  try {
    await refreshClaimedYouTubeConnection(claim, {
      decrypt: decryptClaimedSocialToken,
      refreshYouTube: refreshYouTubeAccessToken,
      getYouTubeIdentity: getYouTubeChannelIdentity,
      complete: completeSocialConnectionRefresh,
    });
  } catch (error) {
    await failSocialConnectionRefresh(
      claim,
      error,
      isProviderAuthenticationFailure(error),
    ).catch(() => undefined);
    throw error;
  }
  return loadYouTubePublishingConnection(now);
}
