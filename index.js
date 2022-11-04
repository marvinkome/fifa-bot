import numeral from "numeral";
import FutPage from "./fut.js";
import FutBin from "./futbin.js";

const futPage = new FutPage();
// const futBin = new FutBin();

const main = async () => {
  await futPage.load();

  // await futBin.load();
  // await futBin.getPlayerPrice({ name: "Haaland", position: "ST", rating: "88" });
};

main();
// .finally(() => futPage.close());
