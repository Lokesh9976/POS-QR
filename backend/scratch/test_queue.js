const { poolPromise, sql } = require("../config/db");
const { queueQRPrintJobs } = require("../utils/printHelper");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Connected to database.");

    // Query a larger list of dishes from DishMaster to build a rich order
    const dishRes = await pool.request().query(`
      SELECT TOP 10 DishId, Name
      FROM DishMaster
      WHERE IsActive = 1
    `);
    console.log("Active dishes found in DB:", dishRes.recordset.length);

    if (dishRes.recordset.length === 0) {
      console.warn("No active dishes found to print.");
      process.exit(1);
    }

    const testDishes = dishRes.recordset;

    // Build a large set of items representing various configurations
    const sentItems = [];

    testDishes.forEach((dish, index) => {
      const item = {
        id: dish.DishId,
        name: dish.Name,
        qty: (index % 3) + 1,
        price: 15.00
      };

      // Add Modifiers to some items
      if (index % 2 === 0) {
        item.modifiers = [
          { ModifierName: "Extra Cheese" },
          { ModifierName: "Spicy Add-on Option" }
        ];
      }

      // Add Combos to some items
      if (index % 3 === 0) {
        item.comboSelections = [
          {
            groupName: "Main Course Choice",
            items: [
              { name: "Combo Portion Fried Rice" },
              { name: "Combo Portion Noodles" }
            ]
          },
          {
            groupName: "Dessert Choice",
            items: [
              { name: "Vanilla Ice Cream" }
            ]
          }
        ];
      }

      // Add Notes/Song Names/Takeaway flags
      if (index === 0) {
        item.note = "Please make this item extremely mild spicy";
        item.isTakeaway = true;
      }
      if (index === 1) {
        item.songName = "Sweet Melody Tribute Track";
      }

      sentItems.push(item);
    });

    // Resolve kitchen details for each dish exactly as backend does
    const dishIds = sentItems.map(item => item.id);
    if (dishIds.length > 0) {
      try {
        const kitchenRes = await pool.request()
          .query(`
            SELECT 
              dish.DishId as id,
              ISNULL(ckt.KitchenTypeCode, '2') as KitchenTypeCode, 
              ISNULL(ISNULL(ckt.KitchenTypeName, cat.CategoryName), 'KITCHEN') as KitchenTypeName,
              pm.PrinterIP as PrinterIP
            FROM DishMaster dish
            LEFT JOIN DishGroupMaster dgm ON dish.DishGroupId = dgm.DishGroupId
            LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
            LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
            LEFT JOIN (
              SELECT *, ROW_NUMBER() OVER(PARTITION BY KitchenTypeValue ORDER BY PrinterId) as rn 
              FROM PrintMaster WHERE IsActive = 1 AND PrinterType = 2
            ) pm ON CAST(ckt.KitchenTypeCode AS VARCHAR(50)) = CAST(pm.KitchenTypeValue AS VARCHAR(50)) AND pm.rn = 1
            WHERE dish.DishId IN (${dishIds.map(id => `'${id}'`).join(",")})
          `);
        console.log("Resolved kitchen details from DB:");
        console.table(kitchenRes.recordset);

        const kitchenMap = {};
        kitchenRes.recordset.forEach(row => {
          kitchenMap[row.id.toLowerCase()] = row;
        });

        sentItems.forEach(item => {
          const kInfo = kitchenMap[String(item.id).toLowerCase()];
          if (kInfo) {
            item.KitchenTypeCode = kInfo.KitchenTypeCode;
            item.KitchenTypeName = kInfo.KitchenTypeName;
            item.PrinterIP = kInfo.PrinterIP || '192.168.0.200'; // Fallback to main test printer IP
          } else {
            item.KitchenTypeCode = '2';
            item.KitchenTypeName = 'Indian';
            item.PrinterIP = '192.168.0.200';
          }
        });
      } catch (err) {
        console.error("Error resolving kitchen info:", err.message);
      }
    }

    console.log(`Queuing print jobs for ${sentItems.length} items...`);

    await queueQRPrintJobs(pool, sql, {
      orderId: "TEST-LARGE-ORDER-999",
      tableNo: "12",
      sentItems,
      isAdditional: false
    });

    console.log("Print queue task completed successfully!");
  } catch (err) {
    console.error("Test runner failed:", err);
  }
  process.exit(0);
}

run();
