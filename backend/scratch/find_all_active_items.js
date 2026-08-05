const { poolPromise } = require("../config/db");

async function findAllActive() {
  try {
    const pool = await poolPromise;
    console.log("=== ITEMS CREATED TODAY IN RESTAURANTORDERDETAILCUR ===");
    const res = await pool.request().query(`
      SELECT d.OrderDetailId, d.OrderId, d.Description, d.Quantity, d.StatusCode, d.CreatedOn, h.OrderNumber, h.Tableno, h.isOrderClosed
      FROM RestaurantOrderDetailCur d
      LEFT JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
      WHERE d.CreatedOn >= '2026-08-05 18:00:00'
      ORDER BY d.CreatedOn DESC
    `);
    console.table(res.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findAllActive();
