import "server-only";

import type {
  NewSocialConnection,
  SocialConnectionRefreshClaim,
} from "./connections";
import type {
  InstagramIdentity,
  InstagramIdentityExpectation,
} from "./providers/instagram-login";
import type {
  TikTokOAuthIdentity,
  TikTokOAuthToken,
} from "./providers/tiktok-oauth";

type InstagramRefreshToken = {
  accessToken: string;
  expiresIn: number;
};

export type SocialTokenRefreshDependencies = {
  decrypt: (
    claim: SocialConnectionRefreshClaim,
    kind: "access" | "refresh",
  ) => string;
  refreshInstagram: (accessToken: string) => Promise<InstagramRefreshToken>;
  getInstagramIdentity: (
    accessToken: string,
    expected: InstagramIdentityExpectation,
  ) => Promise<InstagramIdentity>;
  refreshTikTok: (
    refreshToken: string,
    expectedOpenId: string,
  ) => Promise<TikTokOAuthToken>;
  getTikTokIdentity: (
    accessToken: string,
    expectedAccountId: string,
  ) => Promise<TikTokOAuthIdentity>;
  complete: (
    claim: SocialConnectionRefreshClaim,
    input: NewSocialConnection,
  ) => Promise<void>;
};

export async function refreshClaimedSocialConnection(
  claim: SocialConnectionRefreshClaim,
  dependencies: SocialTokenRefreshDependencies,
) {
  if (claim.provider === "instagram") {
    const currentToken = dependencies.decrypt(claim, "access");
    const token = await dependencies.refreshInstagram(currentToken);
    const identity = await dependencies.getInstagramIdentity(
      token.accessToken,
      { accountId: claim.externalAccountId },
    );
    await dependencies.complete(claim, {
      provider: "instagram",
      tokenType: "Bearer",
      scopes: claim.scopes,
      accessToken: token.accessToken,
      refreshToken: null,
      expiresIn: token.expiresIn,
      refreshTokenExpiresIn: null,
      identity: {
        accountId: identity.accountId,
        username: identity.username,
        snapshot: {
          account_id: identity.accountId,
          app_scoped_user_id: identity.appScopedUserId,
          username: identity.username,
          account_type: identity.accountType,
        },
      },
    });
    return;
  }

  const currentRefreshToken = dependencies.decrypt(claim, "refresh");
  const token = await dependencies.refreshTikTok(
    currentRefreshToken,
    claim.externalAccountId,
  );
  const identity = await dependencies.getTikTokIdentity(
    token.accessToken,
    claim.externalAccountId,
  );
  await dependencies.complete(claim, {
    provider: "tiktok",
    tokenType: token.tokenType,
    scopes: token.scopes,
    accessToken: token.accessToken,
    // TikTok may rotate this value; persist the token returned by the refresh.
    refreshToken: token.refreshToken,
    expiresIn: token.expiresIn,
    refreshTokenExpiresIn: token.refreshTokenExpiresIn,
    identity: {
      accountId: identity.accountId,
      username: identity.username,
      snapshot: {
        business_id: identity.accountId,
        username: identity.username,
        display_name: identity.displayName,
      },
    },
  });
}
