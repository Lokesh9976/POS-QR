const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function findTable10() {
  try {
    const pool = await poolPromise;
    console.log("=== TABLE FOR ID a6817147-645a-454b-a833-a4b5410d85c8 ===");
    const res = await pool.request()
      .input("tid", sql.VarChar(50), "a6817147-645a-454b-a833-a4b5410d85c8")
      .query("SELECT TableId, TableNumber, Status, CurrentOrderId, DiningSection FROM TableMaster WHERE TableId = @tid OR TableNumber = '10'");
    console.table(res.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findTable10();
