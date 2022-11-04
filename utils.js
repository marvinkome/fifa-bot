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

export async function readCookies(file) {
  try {
    const cookiesString = await fs.readFile(file);
    const cookies = JSON.parse(cookiesString);

    return cookies;
  } catch (e) {
    return null;
  }
}

export async function writeCookies(cookies, file) {
  await fs.writeFile(file, JSON.stringify(cookies, null, 2));
}
