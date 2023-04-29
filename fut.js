import _ from "lodash";
import https from "https";
import prompt from "prompt";
import { readCookies, writeCookies } from "./utils.js";
import { axiosInstance, startLogin, completeLogin, refreshAccessToken, getSessionId } from "./ea-auth.js";

if (!process.env.FUT_EMAIL || !process.env.FUT_PASSWORD) {
  throw new Error("Please add credentials to .env file");
}

export default class FUT {
  constructor() {
    this.sid = undefined;
    this.client = axiosInstance();
  }

  load = async () => {
    console.log("[fut][load] fetching cookies and access token");

    let { access_token, cookies } = (await readCookies("./cookies.json")) || {};
    if (!access_token?.token) {
      console.error(`[fut][load] No access token found`);
      ({ access_token, cookies } = await this.login());
    }

    if (access_token.expires_in && Date.now() > parseInt(access_token.expires_in)) {
      console.warn(`[fut][load] Token expired. Refreshing`);

      if (cookies.cookie) {
        const tokenResponse = await refreshAccessToken(access_token.token, cookies.cookie);
        if (_.isEmpty(tokenResponse)) {
          console.error(`[fut][load] token refresh failed`);
          return null;
        }

        const newStoredInfo = {
          cookies,
          access_token: {
            token: tokenResponse.access_token,
            expires_in: Date.now() + tokenResponse.expires_in * 1000,
          },
        };
        await writeCookies(newStoredInfo, "./cookies.json");

        access_token = newStoredInfo.access_token;
        console.log(`[fut][load] Access token refreshed`);
      } else {
        console.error(`[fut][load] No stored cookies found. Please login again`);
        ({ access_token, cookies } = await this.login());
      }
    }

    console.log(`[fut][load] Fetched tokens. Getting sessionId for request`);
    this.sid = await getSessionId(access_token.token);
    console.log(`[fut][load] sessionId fetched`);

    return this;
  };

  login = async () => {
    const loginResp = await startLogin({ email: process.env.FUT_EMAIL, password: process.env.FUT_PASSWORD });
    console.log("[fut][login] Two factor auth requested. Please type in code to continue");

    prompt.start();
    const { code } = await prompt.get({
      properties: {
        code: {
          message: "Two-Factor Authentication Code from email",
        },
      },
    });

    const { tokenResponse, cookies } = await completeLogin({ code, url: loginResp.url, cookies: loginResp.cookies });

    const storedInfo = {
      access_token: {
        token: tokenResponse.access_token,
        expires_in: Date.now() + tokenResponse.expires_in * 1000,
      },
      cookies: {
        cookie: cookies?.cookieString,
        expires_in: cookies?.expiry.getTime() / 1000,
      },
    };
    await writeCookies(storedInfo, "./cookies.json");

    return storedInfo;
  };

  getTransferListItems = async () => {
    if (!this.sid) throw new Error("Please call load() to setup session");

    const staticPlayers = await this.client
      .get("https://www.ea.com/fifa/ultimate-team/web-app/content/23DF3AC5-9539-438B-8414-146FAFDE3FF2/2023/fut/items/web/players.json")
      .then((response) => {
        const data = response.data;
        return [...data.LegendsPlayers, ...data.Players];
      });
    if (!staticPlayers) {
      console.error("[fut][getTransferListItems] failed to fetch static players json");
      return false;
    }

    const response = await this.client.get("https://utas.mob.v1.fut.ea.com/ut/game/fifa23/tradepile", {
      headers: { "X-UT-SID": this.sid },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    const { auctionInfo } = response.data;

    const shouldTriggerRelist = !!auctionInfo.find((item) => item.tradeState === "expired");
    if (shouldTriggerRelist) {
      await this.relistItems();
    }

    const availableItems = auctionInfo.filter((item) => item.tradeState === null && item.itemData.itemType === "player");
    const players = availableItems
      .map((item) => {
        const player = staticPlayers.find((p) => p.id === item.itemData.assetId);
        if (!player) return null;

        return {
          id: item.itemData.id,
          firstName: player.f,
          lastName: player.l,
          fullName: `${player.f} ${player.l}`,
          name: player.c || `${player.l}`,
          rating: item.itemData.rating,
          position: item.itemData.preferredPosition,
        };
      })
      .filter(Boolean);

    return players;
  };

  relistItems = async () => {
    if (!this.sid) throw new Error("Please call load() to setup session");

    await this.client.put("https://utas.mob.v1.fut.ea.com/ut/game/fifa23/auctionhouse/relist", null, {
      headers: { "X-UT-SID": this.sid },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
  };

  listItem = async ({ id, buyNowPrice, startingBid }) => {
    if (!this.sid) throw new Error("Please call load() to setup session");

    await this.client.post(
      "https://utas.mob.v1.fut.ea.com/ut/game/fifa23/auctionhouse",
      {
        buyNowPrice,
        startingBid,
        duration: 3600,
        itemData: { id },
      },
      {
        headers: { "X-UT-SID": this.sid },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }
    );
  };
}
