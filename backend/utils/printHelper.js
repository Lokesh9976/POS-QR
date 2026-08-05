/**
 * printHelper.js
 * Backend utility to format ESC/POS thermal text for KOT and KDS prints.
 * Mirrors the formatKOTThermalText logic in the frontend UniversalPrinter.ts
 * so the backend can queue print jobs directly without relying on the frontend.
 */

/**
 * Format KOT or KDS thermal ESC/POS text.
 * @param {object} data - { orderId, orderNo, tableNo, waiterName, items, kitchenName }
 * @param {string} type - 'NEW' | 'ADDITIONAL' | 'REPRINT' | 'KDS_PRINT'
 * @returns {string} ESC/POS formatted text
 */
function formatKOTThermalText(data, type = 'NEW') {
  const title =
    type === 'KDS_PRINT' ? 'KDS PRINT'
    : type === 'REPRINT'  ? 'REPRINT'
    : type === 'ADDITIONAL' ? 'ADDITIONAL'
    : 'NEW ORDER';

  const items      = data.items       || [];
  const tableNo    = data.tableNo     || 'N/A';
  const waiter     = data.waiterName  || 'Staff';
  const orderNo    = data.orderNo     || data.orderId || '';
  const kitchenName = data.kitchenName || '';

  // Singapore time
  const now = new Date();
  const sgOptions = { timeZone: 'Asia/Singapore' };
  const kotDateStr = new Intl.DateTimeFormat('en-GB', {
    ...sgOptions, day: '2-digit', month: '2-digit', year: '2-digit'
  }).format(now);
  const kotTimeStr = now.toLocaleTimeString('en-GB', {
    ...sgOptions, hour: '2-digit', minute: '2-digit', hour12: false
  });

  let text = `[C]<B>${title}</B>\n`;
  text += `[C]${kotDateStr} ${kotTimeStr}\n`;
  text += '[L]--------------------------------\n';
  
  if (type !== 'KDS_PRINT') {
    text += `[C]<font size='big'>TABLE: ${tableNo}</font>\n`;
    text += '[L]--------------------------------\n';
  }

  text += '[L]QTY  ITEM\n';
  text += '[L]--------------------------------\n';

  // KDS groups all items by kitchen name
  if (type === 'KDS_PRINT') {
    const kitchenGroups = {};
    items.forEach(item => {
      const kName = (
        item.KitchenTypeName || item.kitchenTypeName ||
        item.dishGroupName   || item.categoryName    || 'KITCHEN'
      ).toUpperCase().trim();
      if (!kitchenGroups[kName]) kitchenGroups[kName] = [];
      kitchenGroups[kName].push(item);
    });

    for (const [kName, groupItems] of Object.entries(kitchenGroups)) {
      text += `\n[L]<B>${kName}</B>\n`;
      text += '[L]--------------------------------\n';
      groupItems.forEach(item => {
        text += _formatItem(item);
      });
    }
  } else {
    // KOT: items already belong to one kitchen group
    items.forEach(item => {
      text += _formatItem(item);
    });
  }

  text += `[L]Order By: ${waiter}\n`;
  text += `[L]Order #: ${orderNo}\n`;
  
  if (type === 'KDS_PRINT') {
    text += '[L]--------------------------------\n';
    text += `[C]<font size='big'><B>TABLE NO : ${tableNo}</B></font>\n`;
    text += '[L]--------------------------------\n';
  }

  if (kitchenName && kitchenName !== 'KDS') {
    const bottomLabel = tableNo && tableNo !== 'N/A'
      ? `${kitchenName.toUpperCase()}  /  T.NO: ${tableNo}`
      : kitchenName.toUpperCase();
    text += '[L]--------------------------------\n';
    text += `[C]<font size='big'><B>${bottomLabel}</B></font>\n`;
    text += '[L]--------------------------------\n';
  }

  text += '\n\n';
  return text;
}

/**
 * Format a single item row for ESC/POS output.
 */
function _formatItem(item) {
  let text = '';
  const qtyNum   = item.quantity || item.qty || 1;
  const itemName = item.name     || item.DishName || '';
  const lines    = itemName.split('\n');

  lines.forEach((line, idx) => {
    if (idx === 0) {
      text += `[L]<font size='big'>[${qtyNum}] ${line}</font>\n`;
    } else {
      text += `[L]<font size='big'>    ${line}</font>\n`;
    }
  });

  const songName = item.songName || item.SongName || '';
  if (songName) text += `[L]    🎵 ${songName}\n`;

  const isTakeaway = !!(item.isTakeaway || item.IsTakeaway || item.isTakeAway || item.IsTakeAway);
  if (isTakeaway) text += `[L]    <B>- Takeaway</B>\n`;

  if (item.modifiers && item.modifiers.length > 0) {
    item.modifiers.forEach(m => {
      const modName = m.ModifierName || m.modifierName || m.name || m.ModifierNameEn || "";
      if (modName) {
        const formattedMod = modName.split(' ').filter(Boolean).join('  ');
        text += `[L]      <font size='big'><B>+   ${formattedMod}</B></font>\n`;
      }
    });
  }

  if (item.comboSelections && item.comboSelections.length > 0) {
    item.comboSelections.forEach(g => {
      if (Array.isArray(g.items)) {
        g.items.forEach(opt => {
          const formattedCombo = opt.name.split(' ').filter(Boolean).join('  ');
          text += `[L]      <font size='big'><B>-   ${formattedCombo}</B></font>\n`;
        });
      }
    });
  }

  const noteText = item.note || item.notes || item.Remarks || item.remarks;
  if (noteText) text += `[L]    * NOTE: ${noteText}\n`;

  text += '[L]--------------------------------\n';
  return text;
}

/**
 * Queue KOT and KDS print jobs directly into PrintJobQueue for a QR order.
 * Called by the backend /send route after the order transaction commits.
 * This avoids the duplicate-print risk that comes from frontend-socket-triggered printing.
 *
 * @param {object} pool  - mssql connection pool
 * @param {object} sql   - mssql sql object
 * @param {object} opts  - { orderId, tableNo, sentItems, isAdditional }
 */
async function queueQRPrintJobs(pool, sql, opts) {
  const { orderId, tableNo, sentItems = [], isAdditional = false } = opts;
  const type = isAdditional ? 'ADDITIONAL' : 'NEW';
  const STORE_ID = 'STORE_001';

  // 1. Group items by KitchenTypeCode → one KOT job per kitchen
  const kitchenGroups = {};
  sentItems.forEach(item => {
    const kCode = String(item.KitchenTypeCode || item.kitchenTypeCode || '0');
    if (!kitchenGroups[kCode]) {
      kitchenGroups[kCode] = {
        items: [],
        kitchenName: item.KitchenTypeName || item.kitchenTypeName || 'KITCHEN',
        kitchenTypeValue: kCode,
      };
    }
    kitchenGroups[kCode].items.push(item);
  });

  for (const [kCode, group] of Object.entries(kitchenGroups)) {
    const kotData = {
      orderId,
      orderNo: orderId,
      tableNo,
      waiterName: 'QR Order',
      items: group.items,
      kitchenName: group.kitchenName,
    };
    const thermalText = formatKOTThermalText(kotData, type);

    // Resolve kitchen printer IP from PrintMaster
    let printerIp = '';
    let printerName = '';
    try {
      const printerRes = await pool.request()
        .input('KTV', sql.NVarChar(50), kCode)
        .query(`
          SELECT TOP 1 ISNULL(NULLIF(PrinterIP, ''), NULLIF(PrinterPath, '')) as PrinterIP, PrinterName
          FROM PrintMaster
          WHERE PrinterType = 2
            AND CAST(KitchenTypeValue AS VARCHAR(50)) = CAST(@KTV AS VARCHAR(50))
            AND IsActive = 1
            AND (PrinterIP IS NOT NULL AND PrinterIP <> '' OR PrinterPath IS NOT NULL AND PrinterPath <> '')
        `);
      if (printerRes.recordset.length > 0) {
        printerIp   = printerRes.recordset[0].PrinterIP;
        printerName = printerRes.recordset[0].PrinterName;
      }
    } catch (err) {
      console.warn(`[PrintHelper] Could not resolve kitchen printer for KTV=${kCode}:`, err.message);
    }

    if (!printerIp) {
      console.warn(`[PrintHelper] No kitchen printer IP for KTV=${kCode} — skipping KOT`);
      continue;
    }

    const jobId = require('crypto').randomUUID();
    await pool.request()
      .input('JobId',       sql.UniqueIdentifier, jobId)
      .input('StoreId',     sql.NVarChar(50),     STORE_ID)
      .input('PrinterName', sql.NVarChar(100),    printerName)
      .input('PrinterIp',   sql.NVarChar(100),    printerIp)
      .input('PrinterPort', sql.Int,              9100)
      .input('Content',     sql.NVarChar(sql.MAX), thermalText)
      .query(`
        INSERT INTO PrintJobQueue
          (JobId, StoreId, PrinterName, PrinterIp, PrinterPort, Content, Status, CreatedOn)
        VALUES
          (@JobId, @StoreId, @PrinterName, @PrinterIp, @PrinterPort, @Content, 'PENDING', GETDATE())
      `);
    console.log(`[PrintHelper] ✅ KOT queued for kitchen "${group.kitchenName}" → ${printerIp} [job: ${jobId}]`);
  }

  // 2. Queue KDS print (printerType = 4) — one job with ALL items grouped by kitchen
  try {
    const kdsRes = await pool.request()
      .query(`
        SELECT TOP 1 ISNULL(NULLIF(PrinterIP, ''), NULLIF(PrinterPath, '')) as PrinterIP, PrinterName
        FROM PrintMaster
        WHERE PrinterType = 4 AND IsActive = 1
          AND (PrinterIP IS NOT NULL AND PrinterIP <> '' OR PrinterPath IS NOT NULL AND PrinterPath <> '')
      `);

    if (kdsRes.recordset.length > 0) {
      const { PrinterIP, PrinterName } = kdsRes.recordset[0];
      const kdsData = {
        orderId,
        orderNo: orderId,
        tableNo,
        waiterName: 'QR Order',
        items: sentItems,
        kitchenName: 'KDS',
      };
      const kdsText = formatKOTThermalText(kdsData, 'KDS_PRINT');
      const kdsJobId = require('crypto').randomUUID();
      await pool.request()
        .input('JobId',       sql.UniqueIdentifier, kdsJobId)
        .input('StoreId',     sql.NVarChar(50),     STORE_ID)
        .input('PrinterName', sql.NVarChar(100),    PrinterName)
        .input('PrinterIp',   sql.NVarChar(100),    PrinterIP)
        .input('PrinterPort', sql.Int,              9100)
        .input('Content',     sql.NVarChar(sql.MAX), kdsText)
        .query(`
          INSERT INTO PrintJobQueue
            (JobId, StoreId, PrinterName, PrinterIp, PrinterPort, Content, Status, CreatedOn)
          VALUES
            (@JobId, @StoreId, @PrinterName, @PrinterIp, @PrinterPort, @Content, 'PENDING', GETDATE())
        `);
      console.log(`[PrintHelper] ✅ KDS queued → ${PrinterIP} [job: ${kdsJobId}]`);
    }
  } catch (kdsErr) {
    console.warn('[PrintHelper] KDS print queue failed:', kdsErr.message);
  }
}

module.exports = { formatKOTThermalText, queueQRPrintJobs };
