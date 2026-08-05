const { poolPromise, sql } = require("../config/db");

async function diagnoseTables() {
  try {
    const pool = await poolPromise;
    console.log("=== TABLE MASTER DIAGNOSTICS ===");
    const tables = await pool.request().query(`
      SELECT TableId, TableNumber, Status, CurrentOrderId, StartTime, TotalAmount, entry_status
      FROM TableMaster
      ORDER BY TRY_CAST(TableNumber AS INT), TableNumber
    `);
    console.table(tables.recordset);

    console.log("\n=== ACTIVE ORDERS IN RESTAURANTORDERCUR ===");
    const activeOrders = await pool.request().query(`
      SELECT OrderId, OrderNumber, Tableno, TotalAmount, isOrderClosed, CreatedOn, ModifiedOn
      FROM RestaurantOrderCur
      WHERE (isOrderClosed = 0 OR isOrderClosed IS NULL)
      ORDER BY CreatedOn DESC
    `);
    console.table(activeOrders.recordset);

    console.log("\n=== ACTIVE ORDER DETAILS IN RESTAURANTORDERDETAILCUR ===");
    const activeDetails = await pool.request().query(`
      SELECT d.OrderDetailId, d.OrderId, h.OrderNumber, h.Tableno, d.DishId, d.DishName, d.Quantity, d.PricePerUnit, d.StatusCode, d.CreatedOn
      FROM RestaurantOrderDetailCur d
      JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
      WHERE (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
      ORDER BY h.Tableno, d.CreatedOn ASC
    `);
    console.table(activeDetails.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Diagnostic error:", err);
    process.exit(1);
  }
}

diagnoseTables();
