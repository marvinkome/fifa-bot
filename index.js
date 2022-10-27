import FutPage from "./fut.js";

const futPage = new FutPage();

const main = async () => {
  await futPage.load();
  await futPage.getTransferList();
};

main().finally(() => futPage.close());
