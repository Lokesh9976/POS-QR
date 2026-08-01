const { poolPromise } = require("../config/db");

async function check() {
  try {
    const pool = await poolPromise;
    console.log("=== PRINT MASTER ===");
    const pmRes = await pool.request().query("SELECT * FROM PrintMaster");
    console.table(pmRes.recordset.map(r => ({
      PrinterId: r.PrinterId,
      PrinterName: r.PrinterName,
      PrinterType: r.PrinterType,
      KitchenTypeValue: r.KitchenTypeValue,
      PrinterIP: r.PrinterIP,
      IsActive: r.IsActive
    })));

    console.log("=== LATEST PRINT JOB QUEUE ===");
    const pjqRes = await pool.request().query("SELECT TOP 5 JobId, StoreId, PrinterName, PrinterIp, Status, CreatedOn FROM PrintJobQueue ORDER BY CreatedOn DESC");
    console.table(pjqRes.recordset);
  } catch (err) {
    console.error("Error running checks:", err);
  }
  process.exit(0);
}

check();
