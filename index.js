//require executablePath from puppeteer
import { executablePath } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import RandomUA from "puppeteer-extra-plugin-anonymize-ua";
import FutPage from "./fut.js";
import { wait } from "./utils.js";

puppeteer.use(StealthPlugin());
puppeteer.use(RandomUA());

const futPage = new FutPage();

const main = async () => {
  let browser;

  try {
    browser = await puppeteer.launch({ executablePath: executablePath() });
    await futPage.load(browser);

    const availableItems = await futPage.getTransferListItems();

    for (let i = 0; i < (availableItems || []).length; i++) {
      await futPage.listPlayerOnTransferMarket();

      console.log("Waiting....");
      await wait(10 * 1000);
      console.log("Wait done...");
    }
  } catch (e) {
    console.error(e);
  } finally {
    await futPage.close();
    if (browser) await browser.close();
  }
};

main();
