import numeral from "numeral";
import { screenshot } from "./utils.js";

export default class FutBin {
  constructor(browser) {
    this.browser = browser;
  }

  async getPlayerPrice({ name, rating, position }) {
    let page;
    console.log("FutBin: Getting player price: %j", { name, rating, position });

    try {
      page = await this.browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0");
      await page.goto(`https://www.futbin.com/players?search=${name}`);

      await screenshot(page, 300);

      await page.waitForSelector("table#repTb");
      console.log("FutBin: %s - Results loaded", name);

      const playerXPathSelector = `//table[@id="repTb"]//tr[@data-url][.//a[contains(text(),"${name}")]][.//span[contains(@class, "rating")][text()="${rating}"]][.//div[text()="${position}"]]`;
      await page.waitForXPath(playerXPathSelector);
      console.log("FutBin: %s - Result found", name);

      const [player] = await page.$x(playerXPathSelector);
      const playerPriceEl = await player.$("td:nth-of-type(6) span.ps4_color");
      let compactPrice = await playerPriceEl.evaluate((el) => el.textContent);
      console.log("FutBin: %s - Player price - %s", name, compactPrice);

      const price = numeral(compactPrice.trim().toLowerCase()).value();

      return price;
    } catch (e) {
      console.error("FutBin: Failed to get price for %s", name, e);
      return undefined;
    } finally {
      await page.close();
    }
  }
}
