const { poolPromise } = require("../config/db");

async function debugCurOrders() {
  try {
    const pool = await poolPromise;
    console.log("=== ALL OPEN ORDERS IN RESTAURANTORDERCUR ===");
    const res = await pool.request().query(`
      SELECT OrderId, OrderNumber, Tableno, isOrderClosed, TotalAmount, CreatedOn 
      FROM RestaurantOrderCur 
      WHERE (isOrderClosed = 0 OR isOrderClosed IS NULL)
      ORDER BY CreatedOn DESC
    `);
    console.table(res.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debugCurOrders();
