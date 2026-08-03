const { poolPromise } = require("../config/db");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Checking OPENJSON support...");
    const res = await pool.request().query(`
      SELECT * 
      FROM OPENJSON('[{"id": 1, "name": "Test"}]')
      WITH (
        id INT '$.id',
        name NVARCHAR(50) '$.name'
      )
    `);
    console.log("OPENJSON result:", res.recordset);
  } catch (err) {
    console.error("OPENJSON NOT supported or failed:", err.message);
  } finally {
    process.exit(0);
  }
}

run();
