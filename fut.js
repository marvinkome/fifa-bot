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

    const teamNameSelector = "span.view-navbar-clubinfo-name";
    let needs2FA = false;
    try {
      await this.page.waitForNavigation();
      await this.page.waitForSelector(teamNameSelector, { timeout: 60 * 1000 });
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

      await this.page.waitForSelector(teamNameSelector, { timeout: 60 * 1000 });
      console.log("> App loaded. Saving cookies...");

      const cookies = await this.page.cookies();
      await writeCookies(cookies);
    }

    const teamNameEl = await this.page.$(teamNameSelector);
    const pageTitleEl = await this.page.$(".ut-navigation-bar-view h1.title");

    const teamName = await teamNameEl.evaluate((el) => el.textContent);
    const pageName = await pageTitleEl.evaluate((el) => el.textContent);
    console.log("> Dashboard loaded: \nURL: %s \nTeam: %s \nPage: %s", this.page.url(), teamName, pageName);
  }

  async close() {
    await this.page.close();
    await this.browser.close();
  }
}
