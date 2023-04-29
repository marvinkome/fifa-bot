import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import RandomUA from "puppeteer-extra-plugin-anonymize-ua";
import FUT from "./fut.js";
import FutBin from "./futbin.js";
import { wait } from "./utils.js";
import { executablePath } from "puppeteer";

puppeteer.use(StealthPlugin());
puppeteer.use(RandomUA());

const HIGH_RATED_RATING = 83;
const USE_DEFAULT_PRICE = false;

const main = async () => {
  let browser;

  try {
    browser = await puppeteer.launch({ headless: true, executablePath: executablePath() });
    const futBin = new FutBin(browser);

    const fut = await new FUT().load();
    if (!fut) throw new Error("Failed to load FUT");

    const players = await fut.getTransferListItems();
    console.log("All players fetched. Total ", players.length);

    const subset = players.slice(0, 3);
    for (let player of subset) {
      try {
        const data = await futBin
          .getPlayerPrice({ name: player.fullName, position: player.position, rating: player.rating })
          .then((price) => {
            console.log("Fetched player details", player);

            const isHighRated = parseInt(player.rating) > HIGH_RATED_RATING;
            const prices = {
              startPrice: isHighRated ? price : price - 50,
              buyNowPrice: isHighRated ? price + 100 : price,
            };

            return { prices };
          })
          .catch(() => {
            if (!USE_DEFAULT_PRICE) return;

            // TODO:: find how to get default price
          });

        if (!data) {
          console.log("No price available to player", player);
          continue;
        }

        const { prices } = data;
        console.log("Player price", { player, prices });

        await fut.listItem({
          id: player.id,
          buyNowPrice: prices.buyNowPrice,
          startingBid: prices.startPrice,
        });

        await wait(2 * 1000);
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (browser) await browser.close();
  }
};

main();
