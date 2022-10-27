import prompt from "prompt";
import puppeteer from "puppeteer";
import { readCookies, writeCookies } from "./utils.js";

if (!process.env.FUT_EMAIL || !process.env.FUT_PASSWORD) {
  console.log(process.env.FUT_EMAIL);
  throw new Error("Please add credentials to .env file");
}

let instance = null;

export default class FutPage {
  constructor() {
    if (instance !== null) {
      return instance;
    }

    // set useful selectors
    this.pageTitleSelector = ".ut-navigation-bar-view h1.title";
  }

  async load() {
    await this.loadPage();
    await this.login();
  }

  async loadPage() {
    console.log("> Loading page");
    this.browser = await puppeteer.launch();
    this.page = await this.browser.newPage();

    const cookies = await readCookies();
    await this.page.setCookie(...cookies);

    await this.page.goto("https://www.ea.com/fifa/ultimate-team/web-app/");
    console.log("> Page loaded");
  }

  async login() {
    console.log("> Navigating to login page");
    console.time("Login");
    const loginLink = "button.btn-standard.call-to-action:not(.disabled)";
    await this.page.waitForSelector(loginLink, { timeout: 10000 });
    await Promise.all([this.page.click(loginLink), this.page.waitForNavigation()]);

    // Wait for login form to show
    const loginEmailSelector = "div.otkinput input#email";
    const loginPasswordSelector = "div.otkinput input#password";
    await Promise.race([this.page.waitForSelector(loginEmailSelector), this.page.waitForSelector(loginPasswordSelector)]);
    console.log("> Login page loaded");

    await this.page.type(loginEmailSelector, process.env.FUT_EMAIL || "");
    await this.page.type(loginPasswordSelector, process.env.FUT_PASSWORD || "");

    console.log("> Logging in....");
    await Promise.all([this.page.click("a.otkbtn#logInBtn"), this.page.waitForNavigation()]);
    console.log("> Login done");

    let needs2FA = false;
    let pageTitleEl;
    try {
      [, pageTitleEl] = await Promise.all([
        this.page.waitForNavigation(),
        this.page.waitForSelector(this.pageTitleSelector, { timeout: 60 * 1000 }),
      ]);
    } catch (e) {
      needs2FA = true;
    }

    if (needs2FA) {
      await Promise.all([this.page.click("a.otkbtn#btnSendCode"), this.page.waitForNavigation()]);
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
      await this.page.waitForSelector(codeInputSelector);
      await this.page.type(codeInputSelector, code);

      const submitCodeBtnSelector = "a.otkbtn#btnSubmit";
      console.log("> 2FA submitting...");
      await Promise.all([this.page.click(submitCodeBtnSelector), this.page.waitForNavigation()]);
      console.log("> 2FA submitted...");

      pageTitleEl = await this.page.waitForSelector(this.pageTitleSelector, { timeout: 60 * 1000 });
      console.log("> App loaded. Saving cookies...");

      const cookies = await this.page.cookies();
      await writeCookies(cookies);
    }

    const pageName = await pageTitleEl.evaluate((el) => el.textContent);
    console.log("> Dashboard loaded: \nPage: %s", pageName);
    console.timeEnd("Login");
  }

  async getTransferList() {
    console.time("getTransferList");

    console.log("> Opening transfer page");
    await this.page.waitForSelector("div.ut-click-shield:not(.showing)");
    await Promise.all([
      this.page.click("button.ut-tab-bar-item.icon-transfer"),
      // eslint-disable-next-line no-undef
      this.page.waitForFunction((s) => document.querySelector(s).innerText.toLowerCase() === "transfers", {}, this.pageTitleSelector),
    ]);
    console.log("> Transfer page loaded");

    // wait for loader
    await this.page.waitForSelector("div.ut-click-shield:not(.showing)");

    console.log("> Opening transfer list...");
    const transferListSelector = "div.ut-tile-transfer-list:not(.disabled)";
    await this.page.waitForSelector(transferListSelector);

    await Promise.all([
      this.page.click(transferListSelector),
      // eslint-disable-next-line no-undef
      this.page.waitForFunction((s) => document.querySelector(s).innerText.toLowerCase() === "transfer list", {}, this.pageTitleSelector),
    ]);
    console.log("> Transfer list loaded");

    console.log("> Getting list of players");
    const availableItemsXPathSelector =
      '//section[@class="sectioned-item-list"][.//h2[@class="title"][text()="Available Items"]]/ul[@class="itemList"]/li';
    const availableItems = await this.page.$x(availableItemsXPathSelector);

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

    console.log("> Got list of players", playerDetails);
    console.timeEnd("getTransferList");

    return playerDetails;
  }

  async close() {
    await this.page.close();
    await this.browser.close();
  }
}
