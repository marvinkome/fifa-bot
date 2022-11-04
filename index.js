//require executablePath from puppeteer
import { executablePath } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import RandomUA from "puppeteer-extra-plugin-anonymize-ua";
import FutPage from "./fut.js";
import { wait } from "./utils.js";
import { promises as fs } from "fs";

puppeteer.use(StealthPlugin());
puppeteer.use(RandomUA());

const futPage = new FutPage();

const main = async () => {
  let browser;
  const failedItems = [];

  try {
    browser = await puppeteer.launch({ headless: true, executablePath: executablePath() });
    await futPage.load(browser);

    const playerDetails = await futPage.getTransferListItems();

    for (let player of playerDetails) {
      try {
        await futPage.listPlayerOnTransferMarket(player);

        console.log("Waiting....");
        await wait(10 * 1000);
        console.log("Wait done...");
      } catch (e) {
        failedItems.push(player);
        continue;
      }
    }

    await fs.writeFile("./failed.json", JSON.stringify(failedItems, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await futPage.close();
    if (browser) await browser.close();
  }
};

main();
