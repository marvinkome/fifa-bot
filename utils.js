import { promises as fs } from "fs";

export function wait(ms = 0) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

export async function screenshot(page, waitTime) {
  wait(waitTime);

  console.log("📸 Taking screenshot 📸");
  const screenshot = await page.screenshot({ fullPage: true });
  await fs.writeFile("./debug.png", screenshot);
}

export async function readCookies() {
  const cookiesString = await fs.readFile("./cookies.json");
  const cookies = JSON.parse(cookiesString);

  return cookies;
}

export async function writeCookies(cookies) {
  await fs.writeFile("./cookies.json", JSON.stringify(cookies, null, 2));
}
