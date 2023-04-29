import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import RandomUA from "puppeteer-extra-plugin-anonymize-ua";
import FUT from "./fut.js";
import FutBin from "./futbin.js";
import { wait } from "./utils.js";
import { executablePath } from "puppeteer";

puppeteer.use(StealthPlugin());
puppeteer.use(RandomUA());

const HIGH_RATED_RATING = 79;
const USE_DEFAULT_PRICE = false;

function formatPrice(price) {
  if (price < 1000) {
    if (price % 50 !== 0) {
      return Math.round(price / 50) * 50;
    }

    return price;
  }

  if (price < 10000) {
    if (price % 100 !== 0) return Math.round(price / 100) * 100;
    return price;
  }

  if (price % 250 === 0) return price;
  return Math.round(price / 250) * 250;
}

const main = async () => {
  let browser;

  try {
    browser = await puppeteer.launch({ headless: true, executablePath: executablePath() });
    const futBin = new FutBin(browser);

    const fut = await new FUT().load();
    if (!fut) throw new Error("Failed to load FUT");

    const players = await fut.getTransferListItems();
    console.log("All players fetched. Total ", players.length);

    for (let player of players) {
      try {
        const data = await futBin
          .getPlayerPrice({ name: player.name, position: player.position, rating: player.rating })
          .then((price) => {
            console.log("Fetched player details: Player - %s; Prices: Buy Now %i, Start Bid %i;", player.name);

            const isHighRated = parseInt(player.rating) > HIGH_RATED_RATING;
            const prices = {
              startPrice: formatPrice(isHighRated ? price : price - 50),
              buyNowPrice: formatPrice(isHighRated ? price + 250 : price),
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
        console.log("Player price: Player - %s; Prices: Buy Now %s, Start Bid %s;", player.name, prices.buyNowPrice, prices.startPrice);

        await fut.listItem({
          id: player.id,
          buyNowPrice: prices.buyNowPrice,
          startingBid: prices.startPrice,
        });
        console.log("Player listed -", player.name);

        await wait(2 * 1000);
      } catch (e) {
        console.error(e.message);
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
