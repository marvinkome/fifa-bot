import puppeteer from "puppeteer";
import numeral from "numeral";
// import { screenshot } from "./utils.js";

let instance = null;
export default class FutBin {
  constructor() {
    if (instance !== null) {
      return instance;
    }
  }

  async load() {
    console.log("> Loading page");
    this.browser = await puppeteer.launch();
    this.page = await this.browser.newPage();

    await this.page.setUserAgent("Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0");
    console.log("> Page setup done");
  }

  async getPlayerPrice({ name, rating, position }) {
    console.log("> Getting player prices");
    await this.page.goto(`https://www.futbin.com/players?search=${name}`);

    await this.page.waitForSelector("table#repTb");
    console.log("> Results loaded");

    const playerXPathSelector = `//table[@id="repTb"]//tr[@data-url][.//a[contains(text(),"${name}")]][.//span[contains(@class, "rating")][text()="${rating}"]][.//div[text()="${position}"]]`;
    await this.page.waitForXPath(playerXPathSelector);
    console.log("> Result found");

    const [player] = await this.page.$x(playerXPathSelector);
    const playerPriceEl = await player.$("td:nth-of-type(6) span.ps4_color");
    let compactPrice = await playerPriceEl.evaluate((el) => el.textContent);
    console.log("> Player price - %s", compactPrice);

    const price = numeral(compactPrice.trim().toLowerCase()).value();
    return price;
  }
}
