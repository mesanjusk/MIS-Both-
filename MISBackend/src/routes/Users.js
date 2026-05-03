const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const { z } = require('zod');
const Users = require("../repositories/users");
const { v4: uuid } = require("uuid");
const jwt = require('jsonwebtoken');
const { hashPassword, isHashedPassword, verifyPassword } = require("../utils/password");
const Transaction = require("../repositories/transaction");
const Order = require("../repositories/order");
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');

// LOGIN
router.post("/login", authLimiter, validate({ body: z.object({ User_name: z.string().min(1), Password: z.string().min(1) }) }), async (req, res) => {
  const { User_name, Password } = req.body;

  try {
    // Guard: ACCESS_TOKEN_SECRET must be set
    if (!process.env.ACCESS_TOKEN_SECRET) {
      logger.error("ACCESS_TOKEN_SECRET is not set in environment variables.");
      return res.status(500).json({ status: "fail", message: "Server misconfiguration. Contact admin." });
    }

    const user = await Users.findOne({ User_name });
    if (!user) return res.json({ status: "notexist" });

    const isValidPassword = verifyPassword(Password, user.Password);

    if (isValidPassword) {

      // CREATE JWT TOKEN
      const token = jwt.sign(
        {
          id: user._id,
          userName: user.User_name,
          userGroup: user.User_group,
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.JWT_EXPIRY || "7d" }
      );

      // Migrate plain-text passwords to scrypt on first login
      if (!isHashedPassword(user.Password)) {
        try {
          user.Password = hashPassword(Password);
          await user.save();
        } catch (hashError) {
          logger.error("Password migration failed:", hashError);
        }
      }

      res.json({
        status: "exist",
        token: token,
        userGroup: user.User_group,
        userMobile: user.Mobile_number,
      });

    } else {
      res.json({ status: "invalid", message: "Invalid credentials." });
    }
  } catch (e) {
    logger.error("Error during login:", e);
    res.status(500).json({ status: "fail" });
  }
});


// ADD USER — protected: only authenticated users (admins) can create users
router.post("/addUser", requireAuth, async (req, res) => {
  const {
    User_name,
    Password,
    Mobile_number,
    Amount,
    User_group,
    Allowed_Task_Groups
  } = req.body;

  try {
    const check = await Users.findOne({ Mobile_number });
    if (check) {
      res.json("exist");
    } else {
      const newUser = new Users({
        User_name,
        Password: hashPassword(Password),
        Mobile_number,
        User_group,
        Amount,
        Allowed_Task_Groups,
        User_uuid: uuid()
      });
      await newUser.save();
      res.json("notexist");
    }
  } catch (e) {
    logger.error("Error saving user:", e);
    res.status(500).json("fail");
  }
});

// GET USER LIST — protected, strips Password from response
router.get("/GetUserList", requireAuth, async (req, res) => {
  try {
    const [data, orders, transactions] = await Promise.all([
      Users.find({}).select('-Password'),
      Order.find({}, 'Status'),
      Transaction.find({}, 'Created_by')
    ]);

    const usedFromOrders = new Set();
    for (const od of orders) {
      for (const entry of od.Status) {
        usedFromOrders.add(entry.Assigned);
      }
    }
    const usedFromTransactions = new Set(transactions.map(t => t.Created_by));
    const allUsed = new Set([...usedFromOrders, ...usedFromTransactions]);

    const userWithUsage = data.map(user => ({
      ...user._doc,
      isUsed: allUsed.has(user.User_name),
      Allowed_Task_Groups: user.Allowed_Task_Groups || []
    }));

    res.json({
      success: true,
      result: userWithUsage,
    });
  } catch (err) {
    logger.error("Error fetching users:", err);
    res.status(500).json({ success: false, message: err });
  }
});

// UPDATE USER BY ID (Method 1) — protected
router.put("/updateUser/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { User_name, Password, Mobile_number, User_group, Allowed_Task_Groups } = req.body;

  try {
    const updatePayload = {
      User_name,
      Mobile_number,
      User_group,
      Allowed_Task_Groups
    };

    if (Password) {
      updatePayload.Password = isHashedPassword(Password) ? Password : hashPassword(Password);
    }

    const user = await Users.findByIdAndUpdate(id, updatePayload, { new: true }).select('-Password');

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, result: user });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// AUTH TOKEN CHECK (local middleware kept for backward compat with GetLoggedInUser)
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// GET LOGGED IN USER GROUP
router.get('/GetLoggedInUser', authenticateToken, async (req, res) => {
  try {
    const user = await Users.findById(req.user.id).select('User_group');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, result: { group: user.User_group } });
  } catch (error) {
    logger.error('Error fetching user group:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET SINGLE USER BY ID — protected, strips Password
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const user = await Users.findById(id).select('-Password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      result: user,
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message,
    });
  }
});

// UPDATE USER BY ID (Method 2) — protected
router.put('/update/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { User_name, Mobile_number, User_group, Allowed_Task_Groups } = req.body;

  try {
    const updatedUser = await Users.findOneAndUpdate(
      { _id: id },
      { User_name, Mobile_number, User_group, Allowed_Task_Groups },
      { new: true }
    ).select('-Password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      result: updatedUser,
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message,
    });
  }
});

// GET USER BY NAME — protected, strips Password
router.get('/getUserByName/:username', requireAuth, async (req, res) => {
  const { username } = req.params;

  try {
    const user = await Users.findOne({ User_name: username }).select('-Password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      result: user,
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message,
    });
  }
});

// DELETE USER — protected
router.delete('/DeleteUser/:userUuid', requireAuth, async (req, res) => {
  const { userUuid } = req.params;
  try {
    const filters = [{ User_uuid: userUuid }];
    if (mongoose.isValidObjectId(userUuid)) filters.push({ _id: userUuid });

    const result = await Users.findOneAndDelete({ $or: filters });
    if (!result) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
