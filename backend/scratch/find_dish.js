const { poolPromise } = require("../config/db");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Checking RestaurantOrderDetailCur columns...");
    const columns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'RestaurantOrderDetailCur'
    `);
    console.log("Columns:", columns.recordset.filter(c => ['DishId', 'ProductId'].includes(c.COLUMN_NAME)));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
