import * as dotenv from "dotenv";
import puppeteer from "puppeteer";
import prompt from "prompt";
import { promises as fs } from "fs";

dotenv.config();

const credentials = {
  email: "",
  password: "",
};

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const cookiesString = await fs.readFile("./cookies.json");
  await page.setCookie(...JSON.parse(cookiesString));

  await page.goto("https://www.ea.com/fifa/ultimate-team/web-app/");
  console.log("> Page loaded");

  // Wait for suggest overlay to appear and click "show all results".
  const ctaBtnSelector = "button.btn-standard.call-to-action:not(.disabled)";
  await page.waitForSelector(ctaBtnSelector, { timeout: 10000 });

  // click login button
  console.log("> Selector found");
  await Promise.all([page.click(ctaBtnSelector), page.waitForNavigation()]);

  console.log("> Redirected to " + page.url());

  // Wait for login form to show
  const loginEmailSelector = "div.otkinput input#email";
  const loginPasswordSelector = "div.otkinput input#password";
  await Promise.race([page.waitForSelector(loginEmailSelector), page.waitForSelector(loginPasswordSelector)]);
  console.log("> Login page");
  console.log("> Trying to login");

  await page.type(loginEmailSelector, credentials.email);
  await page.type(loginPasswordSelector, credentials.password);
  console.log("> Credentials typed in");

  const loginBtnSelector = "a.otkbtn#logInBtn";
  await Promise.all([page.click(loginBtnSelector), page.waitForNavigation()]);
  console.log("> Login button clicked");

  const teamNameSelector = "span.view-navbar-clubinfo-name";
  let needs2FA = false;
  try {
    await page.waitForNavigation();
    await page.waitForSelector(teamNameSelector, { timeout: 60 * 1000 });
  } catch (e) {
    needs2FA = true;
  }

  if (needs2FA) {
    const twoFactorBtnSelector = "a.otkbtn#btnSendCode";
    await Promise.all([page.click(twoFactorBtnSelector), page.waitForNavigation()]);
    console.log("> Two factor auth requested. Please type in code to continue");

    prompt.start();
    const { code } = await prompt.get({
      properties: {
        code: {
          message: "Two-Factor Authentication Code from email",
        },
      },
    });

    const codeInputSelector = "div.otkinput input#twoFactorCode";
    await page.waitForSelector(codeInputSelector);

    await page.type(codeInputSelector, code);
    console.log("> 2FA code typed in");

    const submitCodeBtnSelector = "a.otkbtn#btnSubmit";
    await Promise.all([page.click(submitCodeBtnSelector), page.waitForNavigation()]);

    await page.waitForSelector(teamNameSelector, { timeout: 60 * 1000 });
    console.log("> App loaded. Saving cookies...");

    const cookies = await page.cookies();
    await fs.writeFile("./cookies.json", JSON.stringify(cookies, null, 2));
  }

  const teamNameEl = await page.$(teamNameSelector);
  const teamName = await teamNameEl.evaluate((el) => el.textContent);

  console.log("> Dashboard loaded: \nURL: %s \nTeam: %s", page.url(), teamName);

  // List players in transfer list
  console.log("> Opening transfer page");
  const transferMenuSelector = "div.ut-tile-transfer-list:not(.disabled)";
  await page.waitForSelector(transferMenuSelector, { timeout: 10000 });

  const pageTitleSelector = ".ut-navigation-bar-view h1.title";
  await Promise.all([
    page.click(transferMenuSelector),
    page.waitForFunction((s) => document.querySelector(s).innerText.toLowerCase() === "transfer list", {}, pageTitleSelector),
  ]);
  console.log("> Transfer page loaded");

  const pageTitleEl = await page.$(pageTitleSelector);
  const pageTitle = await pageTitleEl.evaluate((el) => el.textContent);
  console.log("> Transfer page title: %s", pageTitle);

  const availableItemsXPathSelector =
    '//section[@class="sectioned-item-list"][.//h2[@class="title"][text()="Available Items"]]/ul[@class="itemList"]/li';
  const availableItems = await page.$x(availableItemsXPathSelector);

  const playerDetails = await Promise.all([
    ...availableItems.map(async (availableItem) => {
      const nameEl = await availableItem.$(".entityContainer > .name");
      const name = await nameEl.evaluate((el) => el.textContent);

      // wait for card details to load
      await availableItem.waitForSelector(".entityContainer > .ut-item-loaded");
      const ratingEl = await availableItem.$(".entityContainer > .ut-item-loaded > .ut-item-view .playerOverview .rating");
      const rating = await ratingEl.evaluate((el) => el.textContent);

      const positionEl = await availableItem.$(".ut-item-loaded > .ut-item-view > .playerOverview .position");
      const position = await positionEl.evaluate((el) => el.textContent);

      return { name, rating, position };
    }),
  ]);

  console.log(JSON.stringify(playerDetails, null, 2));

  await page.close();
  await browser.close();
})();
