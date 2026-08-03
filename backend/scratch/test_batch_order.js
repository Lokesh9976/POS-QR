const { poolPromise } = require("../config/db");
const http = require("http");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB. Querying TableMaster and DishMaster...");

    // Find a valid table GUID
    const tableRes = await pool.request().query("SELECT TOP 1 TableId, TableNumber FROM TableMaster");
    const table = tableRes.recordset[0];
    if (!table) {
      console.error("No tables found in TableMaster!");
      process.exit(1);
    }
    const tableId = String(table.TableId).replace(/^\{|\}$/g, "").trim();
    console.log(`Using Table: ${table.TableNumber} (${tableId})`);

    // Find a valid dish GUID
    const dishRes = await pool.request().query("SELECT TOP 1 DishId, Name FROM DishMaster");
    const dish = dishRes.recordset[0];
    if (!dish) {
      console.error("No dishes found in DishMaster!");
      process.exit(1);
    }
    const dishId = String(dish.DishId).replace(/^\{|\}$/g, "").trim();
    console.log(`Using Dish: ${dish.Name} (${dishId})`);

    // Construct 120 mock items
    const items = [];
    for (let i = 0; i < 120; i++) {
      items.push({
        id: dishId,
        lineItemId: require("crypto").randomUUID(),
        qty: 1,
        price: 10,
        name: `Mock Dish ${i}`,
        status: "NEW"
      });
    }

    const payload = JSON.stringify({
      tableId: tableId,
      items: items,
      userId: "00000000-0000-0000-0000-000000000000"
    });

    console.log("Sending POST request to /api/orders/send with 120 items...");
    const req = http.request({
      hostname: "localhost",
      port: 3000,
      path: "/api/orders/send",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        console.log(`HTTP Status: ${res.statusCode}`);
        console.log("Response:", data);
        if (res.statusCode === 200) {
          console.log("🎉 Test passed successfully!");
        } else {
          console.error("❌ Test failed!");
        }
        process.exit(0);
      });
    });

    req.on("error", (err) => {
      console.error("Connection Error:", err.message);
      process.exit(1);
    });

    req.write(payload);
    req.end();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
