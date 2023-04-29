import https from "https";
import axios from "axios";
import crypto from "crypto";
import { CookieJar } from "tough-cookie";
import { HttpCookieAgent, HttpsCookieAgent } from "http-cookie-agent/http";

export const axiosInstance = (jar) => {
  let options = {};
  if (jar) options.cookies = { jar };

  const client = axios.create({
    httpAgent: new HttpCookieAgent(options),
    httpsAgent: new HttpsCookieAgent({ ...options, secureOptions: crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION }),
  });

  return client;
};

const _rand = (outputLength = 32) => {
  const output = [];
  const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const charLength = characters.length;

  for (let i = 0, l = outputLength; i < l; ++i) {
    output.push(characters.charAt(Math.floor(Math.random() * charLength)));
  }

  return output.join("");
};

async function getLoginLocation() {
  const jar = new CookieJar();
  const client = axiosInstance(jar);

  const response = await client.get("https://accounts.ea.com/connect/auth", {
    params: {
      response_type: "token",
      client_id: "FIFA23_JS_WEB_APP",
      release_type: "prod",
    },
  });

  const selflocation = String(response.headers["selflocation"] || "");
  const cookieString = await jar.getCookieString(selflocation);
  console.log("[getLoginLocation] gotten login location");

  if (!cookieString.length) throw new Error();

  return {
    url: selflocation,
    cookies: cookieString,
  };
}

async function trigger2FA(url, cookies) {
  const client = axiosInstance();
  const response = await client.post(
    url,
    {
      codeType: "EMAIL",
      _eventId: "submit",
    },
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
      },
      validateStatus: () => true,
    }
  );

  const sentCode = response.data.match(/Enter your code below./g);
  if (!sentCode) {
    throw new Error("failed to trigger 2FA");
  }

  return response.request.res.responseUrl;
}

async function submit2FA(code, url, cookies) {
  const client = axiosInstance();
  const response = await client.post(
    url,
    {
      oneTimeCode: code,
      _eventId: "submit",
      _trustThisDevice: "on",
      trustThisDevice: "on",
    },
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
      },
      validateStatus: () => true,
    }
  );

  const pageData = response.data;
  const matchRedirect = pageData.match(/window\.location = "(.*)"/);
  if (matchRedirect === null || matchRedirect[1] === void 0) {
    console.log("[submit2FA] Invalid code provided");
    throw new Error("invalid credential");
  }

  console.log("[submit2FA] submit otp successfull");
  return matchRedirect[1];
}

async function getAccessToken(url, removeCookies) {
  const jar = new CookieJar();
  const client = axiosInstance(jar);

  const response = await client.get(url, {
    maxRedirects: 0,
  });

  const cookieString = await jar.getCookieString(url);
  const cookies = await jar.getCookies(url);
  const expiry = cookies.find((c) => c.key === "remid")?.expires;

  return {
    tokenResponse: response.data,
    cookies: removeCookies
      ? null
      : {
          cookieString,
          expiry,
        },
  };
}

export async function startLogin(cred) {
  const { url, cookies } = await getLoginLocation();

  const client = axiosInstance();
  const response = await client.post(
    url,
    {
      email: cred.email,
      password: cred.password,
      cid: _rand(),
      showAgeUp: true,
      loginMethod: "emailPassword",
      _eventId: "submit",
      _rememberMe: "on",
      rememberMe: "on",
      thirdPartyCaptchaResponse: "",
    },
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
      },
      validateStatus: () => true,
    }
  );

  const pageData = response.data;
  const needs2FA = pageData.match(/We'll send a verification code to/g);
  console.log("[startLogin] User logged in, trigger 2FA");

  if (!needs2FA || !needs2FA?.length) {
    throw new Error("Non 2FA path not implemented. Or something else went wrong");
  }

  const twoFaURl = response.request.res.responseUrl;
  const twoFaDetails = await trigger2FA(twoFaURl, cookies);

  console.log("[startLogin] 2FA code triggered");
  return { url: twoFaDetails, cookies };
}

export async function completeLogin(data) {
  const nextUrl = await submit2FA(data.code, data.url, data.cookies);
  return await getAccessToken(nextUrl);
}

export async function refreshAccessToken(accessToken, cookies) {
  const client = axiosInstance();

  const response = await client.get("https://accounts.ea.com/connect/auth", {
    params: {
      client_id: "FIFA23_JS_WEB_APP",
      response_type: "token",
      hide_create: "true",
      redirect_uri: "https://www.ea.com/fifa/ultimate-team/web-app/auth.html",
      scope: "basic.identity offline signin basic.entitlement basic.persona",
      accessToken,
    },
    headers: {
      Cookie: cookies,
    },
    maxRedirects: 0,
    validateStatus: () => true,
  });

  const redirectUrl = response.headers.location;

  let data = {};
  redirectUrl
    .split("#")[1]
    .split("&")
    .forEach((param) => {
      const [key, value] = param.split("=");
      data[key] = value;
    });

  return data;
}

export async function getSessionId(access_token) {
  const client = axiosInstance();

  const [codeResponse, pidResponse] = await Promise.all([
    client.get("https://accounts.ea.com/connect/auth", {
      params: {
        client_id: "FUTWEB_BK_OL_SERVER",
        redirect_uri: "nucleus:rest",
        response_type: "code",
        access_token,
      },
    }),

    client.get("https://gateway.ea.com/proxy/identity/pids/me", {
      headers: {
        Authorization: "Bearer " + access_token,
      },
    }),
  ]);

  console.log("[getSessionId] code and pid recieved");

  const { code } = codeResponse.data;
  const { pidId } = pidResponse.data.pid;

  const [newCodeResponse, accountInfoResponse] = await Promise.all([
    client.get("https://accounts.ea.com/connect/auth", {
      params: {
        client_id: "FUTWEB_BK_OL_SERVER",
        redirect_uri: "nucleus:rest",
        response_type: "code",
        access_token,
      },
    }),

    client.get("https://utas.external.s2.fut.ea.com/ut/game/fifa23/v2/user/accountinfo", {
      params: {
        filterConsoleLogin: "true",
        sku: "FUT23WEB",
        returningUserGameYear: "2022",
        clientVersion: "1",
      },
      headers: {
        "Easw-Session-Data-Nucleus-Id": pidId,
        "Nucleus-Access-Code": code,
        "Nucleus-Redirect-Url": "nucleus:rest",
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    }),
  ]);
  console.log("[getSessionId] account info and new code received");

  const { personaId } = accountInfoResponse.data.userAccountInfo.personas[0] || {};
  const { code: newCode } = newCodeResponse.data;

  const sidResponse = await client.post(
    "https://utas.mob.v1.fut.ea.com/ut/auth",
    {
      clientVersion: 1,
      gameSku: "FFA23PS5",
      identification: {
        authCode: newCode,
        redirectUrl: "nucleus:rest",
      },
      isReadOnly: false,
      locale: "en-US",
      method: "authcode",
      nucleusPersonaId: personaId,
      priorityLevel: 4,
      sku: "FUT23WEB",
    },
    {
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    }
  );
  console.log("[getSessionId] sid received");
  const { sid } = sidResponse.data;

  return sid;
}
