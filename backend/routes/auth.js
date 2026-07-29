const express = require("express");
const router = express.Router();
const { poolPromise, sql } = require("../config/db");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set!");
}
const bcrypt = require("bcryptjs");

/* ================= AUTH - LOGIN ================= */
router.post("/login", async (req, res) => {
  try {
    const pool = await poolPromise;
    if (!pool) {
      return res.status(503).json({ success: false, message: "Database connection busy or unavailable." });
    }

    const { userName: rawUserName, password: rawPassword } = req.body;
    const userName = (rawUserName || "").trim();
    const password = (rawPassword || "").trim();

    if (!userName || !password) {
      return res.status(400).json({ success: false, message: "User ID and Password are required." });
    }

    console.log(`[AUTH] Attempting login for UserName: "${userName}"`);

    const result = await pool.request()
      .input("UserName", userName)
      .query(`
        SELECT 
          u.UserId, u.UserCode, u.UserName, u.UserPassword, u.FullName,
          u.FirstName, u.LastName, u.IsDisabled, u.UserGroupid,
          u.FromDate, u.ToDate,
          g.UserGroupCode AS RoleCode, g.UserGroupName AS RoleName,
          g.isActive AS IsGroupActive
        FROM [dbo].[UserMaster] u
        LEFT JOIN [dbo].[UserGroupMaster] g ON u.UserGroupid = g.UserGroupId
        WHERE u.UserName = @UserName
      `);

    if (result.recordset.length === 0) {
      // Check if they are a registered member in MemberMaster
      const encodedPassword = Buffer.from(password).toString("base64");
      const memberResult = await pool.request()
        .input("username", sql.VarChar, userName)
        .input("password", sql.VarChar, encodedPassword)
        .query(`
          SELECT
              M.MemberId,
              M.Name AS UserName,
              M.Email,
              M.Phone AS Phone,
              M.Promocode,
              M.Promoamount,
              (
                  CASE
                      WHEN M.CreditLimit > 0
                          THEN M.CreditLimit - M.CurrentBalance + ISNULL(M.Promoamount, 0)
                      ELSE
                          M.CurrentBalance + ISNULL(M.Promoamount, 0)
                  END
              ) AS AvailableCredit
          FROM MemberMaster M
          WHERE M.Name = @username
            AND M.Password = @password
            AND M.IsActive = 1
        `);

      if (memberResult.recordset.length > 0) {
        const memberUser = memberResult.recordset[0];
        console.log(`[AUTH] Member Login Success: "${memberUser.UserName}"`);
        
        // Generate JWT token for member using MemberId
        const token = jwt.sign(
          {
            userId: memberUser.MemberId,
            username: memberUser.UserName,
            memberId: memberUser.MemberId,
            role: "MEMBER"
          },
          JWT_SECRET,
          { expiresIn: "24h" }
        );

        return res.json({
          success: true,
          token,
          user: {
            userId: memberUser.MemberId,
            id: memberUser.MemberId,
            userName: memberUser.UserName,
            fullName: memberUser.UserName,
            email: memberUser.Email,
            phone: memberUser.Phone,
            role: "MEMBER",
            MemberId: memberUser.MemberId,
            Promocode: memberUser.Promocode,
            Promoamount: memberUser.Promoamount,
            AvailableCredit: memberUser.AvailableCredit
          }
        });
      }

      console.log(`[AUTH] Login failed: UserName "${userName}" not found in UserMaster or MemberMaster.`);
      return res.status(401).json({ success: false, message: "Invalid User ID or Password." });
    }

    const user = result.recordset[0];

    // ✅ VALIDATE USER STATUS
    if (user.IsDisabled === true || user.IsDisabled === 1) {
      console.log(`[AUTH] Login failed: Account disabled for user "${user.UserName}".`);
      return res.status(403).json({ success: false, message: "Your account is disabled." });
    }

    // ✅ VALIDATE USER GROUP (STRICT CHECK)
    if (!user.UserGroupid || !user.RoleCode) {
      console.log(`[AUTH] Login failed: No valid group assigned to user "${user.UserName}".`);
      return res.status(403).json({ success: false, message: "User has no valid group assigned." });
    }

    if (user.IsGroupActive === false || user.IsGroupActive === 0) {
      console.log(`[AUTH] Login failed: User group is inactive for user "${user.UserName}".`);
      return res.status(403).json({ success: false, message: "Your user group is currently inactive." });
    }

    const dbPassword = (user.UserPassword || "").trim();
    let isValid = false;
    let needsRehash = false;

    // 1. Try bcrypt check
    try {
      if (dbPassword.startsWith("$2a$") || dbPassword.startsWith("$2b$")) {
        isValid = await bcrypt.compare(password, dbPassword);
      }
    } catch (e) {
      console.error("Bcrypt compare error:", e);
    }

    // 2. Legacy check fallback
    if (!isValid) {
      const parts = dbPassword.split("-");
      const candidates = [dbPassword, parts[0]].filter(c => c.length > 0);

      for (const cand of candidates) {
        if (cand === password) { isValid = true; needsRehash = true; break; }
        try {
          const decoded = Buffer.from(cand, "base64").toString("utf-8").trim();
          if (decoded === password) { isValid = true; needsRehash = true; break; }
        } catch (e) {}
      }
    }

    if (!isValid) {
      console.log(`[AUTH] Login failed: Password mismatch for user "${user.UserName}".`);
      return res.status(401).json({ success: false, message: "Invalid User ID or Password." });
    }

    // Auto-migrate legacy password to bcrypt
    if (needsRehash) {
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.request()
          .input("UserId", user.UserId)
          .input("HashedPassword", hashedPassword)
          .query("UPDATE [dbo].[UserMaster] SET UserPassword = @HashedPassword WHERE UserId = @UserId");
        console.log(`[AUTH] Successfully migrated password to bcrypt for user "${user.UserName}".`);
      } catch (e) {
        console.error(`[AUTH] Failed to migrate password to bcrypt for user "${user.UserName}":`, e);
      }
    }

    // ✅ VALIDATE USER-SPECIFIC LICENSE WINDOW
    if (user.ToDate) {
      const today = new Date();
      const expDate = new Date(user.ToDate);
      today.setHours(0,0,0,0);
      expDate.setHours(0,0,0,0);
      if (today > expDate) {
        console.log(`[AUTH] Login failed: User "${user.UserName}" license expired on ${expDate.toISOString().split('T')[0]}`);
        return res.status(403).json({ success: false, message: "License expired. Please contact administrator." });
      }
    }
    if (user.FromDate) {
      const today = new Date();
      const fromDate = new Date(user.FromDate);
      today.setHours(0,0,0,0);
      fromDate.setHours(0,0,0,0);
      if (today < fromDate) {
        console.log(`[AUTH] Login failed: User "${user.UserName}" license not active until ${fromDate.toISOString().split('T')[0]}`);
        return res.status(403).json({ success: false, message: "License not active yet. Please contact administrator." });
      }
    }

    // Update Last Login
    await pool.request()
      .input("UserId", user.UserId)
      .query("UPDATE [dbo].[UserMaster] SET LastLogInDate = GETDATE() WHERE UserId = @UserId");

    const finalUserId = String(user.UserId).trim();
    const roleCode = (user.RoleCode || "CASHIER").toUpperCase().trim();

    // 1. Generate Security Token (JWT)
    const token = jwt.sign(
      { userId: finalUserId, role: roleCode },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    console.log(`✅ Login Success: ${user.FullName} | Role: ${roleCode}`);

    // 2. Return Comprehensive Auth Response
    return res.json({
      success: true,
      token,
      user: {
        userId: finalUserId,
        id: finalUserId,
        userCode: user.UserCode,
        userName: user.UserName,
        fullName: user.FullName || user.FirstName,
        role: roleCode, // ADMIN, CASHIER, WAITER, etc.
        roleName: user.RoleName,
        userGroupId: user.UserGroupid,
        licenseFromDate: user.FromDate,
        licenseToDate: user.ToDate
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

/* ================= AUTH - VERIFY PASSWORD (ROLE-BASED) ================= */
router.post("/verify", async (req, res) => {
  try {
    const { password, role } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: "Missing password" });
    }

    const pool = await poolPromise;
    const base64Password = Buffer.from(password).toString("base64");

    let query = `
      SELECT u.UserId, u.UserPassword, u.UserName 
      FROM [dbo].[UserMaster] u
      INNER JOIN [dbo].[UserGroupMaster] g ON u.UserGroupid = g.UserGroupId
      WHERE (u.IsDisabled IS NULL OR u.IsDisabled = 0)
        AND g.isActive = 1
    `;

    const request = pool.request();

    if (role) {
      let roleList = [];
      if (Array.isArray(role)) {
        roleList = role.map(r => String(r).toUpperCase().trim());
      } else if (typeof role === 'string') {
        roleList = role.split(',').map(r => r.toUpperCase().trim());
      }

      if (roleList.length > 0) {
        const conditions = [];
        roleList.forEach((r, idx) => {
          const paramName = `role_${idx}`;
          request.input(paramName, sql.VarChar, r);
          conditions.push(`UPPER(g.UserGroupCode) = @${paramName} OR UPPER(g.UserGroupName) = @${paramName}`);
        });
        query += ` AND (${conditions.join(' OR ')})`;
      }
    }

    const result = await request.query(query);

    let isValid = false;
    let matchedUser = null;
    let needsRehash = false;

    for (const u of result.recordset) {
      const dbPassword = (u.UserPassword || "").trim();
      
      // Try bcrypt check
      if (dbPassword.startsWith("$2a$") || dbPassword.startsWith("$2b$")) {
        try {
          if (await bcrypt.compare(password, dbPassword)) {
            isValid = true;
            matchedUser = u;
            break;
          }
        } catch (e) {}
      } else {
        // Try legacy check
        const parts = dbPassword.split("-");
        const candidates = [dbPassword, parts[0]].filter(c => c.length > 0);

        for (const cand of candidates) {
          if (cand === password || Buffer.from(cand, "base64").toString("utf-8").trim() === password) {
            isValid = true;
            matchedUser = u;
            needsRehash = true;
            break;
          }
        }
        if (isValid) break;
      }
    }

    // Auto-migrate legacy password to bcrypt during verification
    if (isValid && needsRehash && matchedUser) {
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.request()
          .input("UserId", matchedUser.UserId)
          .input("HashedPassword", hashedPassword)
          .query("UPDATE [dbo].[UserMaster] SET UserPassword = @HashedPassword WHERE UserId = @UserId");
        console.log(`[AUTH] Successfully migrated password to bcrypt for user "${matchedUser.UserName}" during verification.`);
      } catch (e) {
        console.error(`[AUTH] Failed to migrate password to bcrypt during verification:`, e);
      }
    }

    return res.json({ success: isValid });
  } catch (err) {
    console.error("VERIFY ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// 🚀 PERMISSIONS CACHE (5-minute TTL)
const permissionCache = new Map();
const PERM_CACHE_TTL = 5 * 60 * 1000;

/* ================= AUTH - PERMISSIONS ================= */
router.get("/permissions/:userGroupCode", async (req, res) => {
  try {
    const { userGroupCode } = req.params;
    const cacheKey = (userGroupCode || "").trim().toUpperCase();

    if (!cacheKey) {
      return res.status(400).json({ error: "Invalid user group code" });
    }

    // Check memory cache
    const cached = permissionCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < PERM_CACHE_TTL)) {
      console.log(`⚡ [Permissions Cache] Hit for group: ${cacheKey}`);
      return res.json(cached.data);
    }

    console.log(`🔎 [Permissions Cache] Miss for group: ${cacheKey}. Fetching from DB...`);
    const pool = await poolPromise;
    const result = await pool.request()
      .input("UserGroupCode", cacheKey)
      .query(`
        SELECT 
          LTRIM(RTRIM(FormCode)) AS FormCode,
          LTRIM(RTRIM(AllowAdd))    AS AllowAdd,
          LTRIM(RTRIM(AllowUpdate)) AS AllowUpdate,
          LTRIM(RTRIM(AllowDelete)) AS AllowDelete,
          LTRIM(RTRIM(AllowRead))   AS AllowRead
        FROM [dbo].[UserPermission]
        WHERE UserGroupCode = @UserGroupCode
      `);

    const permMap = {};
    for (const row of result.recordset) {
      if (row.FormCode) {
        permMap[row.FormCode] = {
          canAdd:    row.AllowAdd    === "A",
          canUpdate: row.AllowUpdate === "U",
          canDelete: row.AllowDelete === "D",
          canRead:   row.AllowRead   === "R",
        };
      }
    }

    // Save to cache
    permissionCache.set(cacheKey, {
      data: permMap,
      timestamp: Date.now()
    });

    res.json(permMap);
  } catch (err) {
    console.error("PERMISSIONS FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ SIGNUP API
router.post("/signup", async (req, res) => {
  try {
    const username = req.body.username?.trim() || req.body.customerName?.trim();
    const password = req.body.password?.trim();
    const phone = req.body.phone?.trim() || req.body.mobileNumber?.trim();
    const email = req.body.email?.trim() || "";
    const encodedPassword = Buffer.from(password).toString("base64");

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    const pool = await poolPromise;
    let promoAmount = 0;
    // Promo Code Validation
    if (req.body.promoCode && req.body.promoCode.trim() !== "") {

      const promoResult = await pool.request()
        .input("PromoCode", sql.NVarChar, req.body.promoCode.trim())
        .query(`
      SELECT *
      FROM PromoCodeMaster
      WHERE PromoCode = @PromoCode
        AND IsActive = 1
    `);

      if (promoResult.recordset.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid Promo Code"
        });
      }

      const promo = promoResult.recordset[0];

      if (promo) {
        promoAmount = promo.DiscountValue;
      }

      if (
        promo.MaxUsage !== null &&
        promo.UsedCount >= promo.MaxUsage
      ) {
        return res.status(400).json({
          success: false,
          message: "This Promo Code has already been used."
        });
      }
    }

    // Check MemberMaster for unique username, phone, and email
    const userResult = await pool.request()
      .input("username", sql.VarChar, username)
      .input("phone", sql.VarChar, phone || "")
      .input("email", sql.VarChar, email || "")
      .query(`
        SELECT Name, Phone, Email
        FROM MemberMaster
        WHERE Name = @username
           OR (Phone = @phone AND @phone <> '')
           OR (Email = @email AND @email <> '')
      `);

    if (userResult.recordset.length > 0) {
      const match = userResult.recordset[0];
      if (match.Name.toLowerCase() === username.toLowerCase()) {
        return res.status(409).json({ success: false, message: "Username already exists" });
      }
      if (match.Phone === phone) {
        return res.status(409).json({ success: false, message: "Phone number already registered" });
      }
      if (email && match.Email === email) {
        return res.status(409).json({ success: false, message: "Email ID already registered" });
      }
    }

    const memberId = require("crypto").randomUUID();
    await pool.request()
      .input("memberId", sql.UniqueIdentifier, memberId)
      .input("name", sql.NVarChar, username)
      .input("phone", sql.NVarChar, phone || "")
      .input("email", sql.NVarChar, email)
      .input("creditLimit", sql.Decimal, 0)
      .input("createdAt", sql.DateTime, new Date())
      .input("address", sql.VarChar, "")
      .input("isActive", sql.Bit, 1)
      .input("balance", sql.Decimal, 0)
      .input("currentBalance", sql.Decimal, 0)
      .input("lowBalanceAlertSent", sql.Bit, 0)
      .input("promoCode", sql.VarChar, req.body.promoCode || "")
      .input("promoAmount", sql.Decimal(18, 2), promoAmount)
      .input("password", sql.VarChar, encodedPassword)
      .query(`
        INSERT INTO MemberMaster (MemberId, Name, Phone, Email, CreditLimit, CreatedAt, Address, IsActive, Balance, CurrentBalance, LowBalanceAlertSent, Promocode, Promoamount, Password)
        VALUES (@memberId, @name, @phone, @email, @creditLimit, @createdAt, @address, @isActive, @balance, @currentBalance, @lowBalanceAlertSent, @promoCode, @promoAmount, @password)
      `);

    if (req.body.promoCode && req.body.promoCode.trim() !== "") {
      await pool.request()
        .input("PromoCode", sql.NVarChar, req.body.promoCode.trim())
        .query(`
      UPDATE PromoCodeMaster
      SET UsedCount = UsedCount + 1
      WHERE PromoCode = @PromoCode
    `);
    }

    const newUser = await pool.request()
      .input("username", sql.VarChar, username)
      .query(`
      SELECT
          M.MemberId,
          M.Name AS UserName,
          M.Promocode,
          M.Promoamount,
          (
              CASE
                  WHEN M.CreditLimit > 0
                      THEN M.CreditLimit - M.CurrentBalance + ISNULL(M.Promoamount, 0)
                  ELSE
                      M.CurrentBalance + ISNULL(M.Promoamount, 0)
              END
          ) AS AvailableCredit
      FROM MemberMaster M
      WHERE M.Name = @username
  `);

    res.json({
      success: true,
      user: newUser.recordset[0]
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

module.exports = router;
