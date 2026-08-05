const { poolPromise } = require("../config/db");

async function findOrder91() {
  try {
    const pool = await poolPromise;
    console.log("=== INSPECTING ORDER '20260805-0091' IN RESTAURANTORDERCUR ===");
    const resCur = await pool.request().query(`
      SELECT OrderId, OrderNumber, Tableno, isOrderClosed, TotalAmount, CreatedOn 
      FROM RestaurantOrderCur 
      WHERE OrderNumber = '20260805-0091'
    `);
    console.table(resCur.recordset);

    console.log("=== INSPECTING ORDER '20260805-0091' IN RESTAURANTORDER (HISTORICAL) ===");
    const resHist = await pool.request().query(`
      SELECT OrderId, OrderNumber, Tableno, isOrderClosed, TotalAmount, CreatedOn 
      FROM RestaurantOrder 
      WHERE OrderNumber = '20260805-0091'
    `);
    console.table(resHist.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findOrder91();
