import puppeteer from "puppeteer";
import FutPage from "./fut.js";

const futPage = new FutPage();

const main = async () => {
  let browser;

  try {
    browser = await puppeteer.launch();
    await futPage.load(browser);

    const availableItems = await futPage.getTransferListItems();
    await futPage.listPlayerOnTransferMarket(availableItems[0]);

    // for (let availableItem of availableItems) {
    //   // list player in market
    // }
  } catch (e) {
    console.error(e);
  } finally {
    await futPage.close();
    if (browser) await browser.close();
  }
};

main();
