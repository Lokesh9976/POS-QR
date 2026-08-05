const { poolPromise } = require("../config/db");

async function findUnlinked() {
  try {
    const pool = await poolPromise;
    console.log("=== HEADERS FOR TABLE 10 IN RESTAURANTORDERCUR ===");
    const resHeaders = await pool.request().query(`
      SELECT OrderId, OrderNumber, Tableno, isOrderClosed, TotalAmount, CreatedOn 
      FROM RestaurantOrderCur 
      WHERE RTRIM(LTRIM(Tableno)) = '10'
      ORDER BY CreatedOn DESC
    `);
    console.table(resHeaders.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findUnlinked();
