const { poolPromise } = require("../config/db");

async function debugT10() {
  try {
    const pool = await poolPromise;
    console.log("=== TABLEMASTER STATE FOR TABLE 10 ===");
    const tables = await pool.request().query(`
      SELECT TableId, TableNumber, Status, CurrentOrderId, TotalAmount, StartTime, ModifiedOn 
      FROM TableMaster 
      WHERE TableNumber = '10'
    `);
    console.table(tables.recordset);

    console.log("\n=== RESTAURANTORDERCUR FOR '10' OR '20260805-0091' ===");
    const curOrders = await pool.request().query(`
      SELECT OrderId, OrderNumber, Tableno, isOrderClosed, TotalAmount, CreatedOn, ModifiedOn 
      FROM RestaurantOrderCur 
      WHERE RTRIM(LTRIM(Tableno)) = '10' OR OrderNumber = '20260805-0091'
      ORDER BY CreatedOn DESC
    `);
    console.table(curOrders.recordset);

    console.log("\n=== RESTAURANTORDER (HISTORICAL) FOR '10' OR '20260805-0091' ===");
    const histOrders = await pool.request().query(`
      SELECT OrderId, OrderNumber, Tableno, isOrderClosed, TotalAmount, CreatedOn, ModifiedOn 
      FROM RestaurantOrder 
      WHERE RTRIM(LTRIM(Tableno)) = '10' OR OrderNumber = '20260805-0091'
      ORDER BY CreatedOn DESC
    `);
    console.table(histOrders.recordset);

    console.log("\n=== ITEMS IN RESTAURANTORDERDETAILCUR FOR '20260805-0091' OR ACTIVE ===");
    const curItems = await pool.request().query(`
      SELECT OrderDetailId, OrderId, DishId, Description, Quantity, PricePerUnit, StatusCode, CreatedOn 
      FROM RestaurantOrderDetailCur 
      WHERE OrderId IN (
        SELECT OrderId FROM RestaurantOrderCur WHERE RTRIM(LTRIM(Tableno)) = '10' OR OrderNumber = '20260805-0091'
      )
    `);
    console.table(curItems.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

debugT10();
