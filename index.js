import FutPage from "./fut.js";

const futPage = new FutPage();

const main = async () => {
  await futPage.load();
};

main().finally(() => futPage.close());
