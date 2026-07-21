// scripts/create-order-indexes.js
require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set. Set it in your environment or .env file before running this script.");
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(MONGO_URI, {});

    const Orders = mongoose.connection.collection("orders");

    // Common indexes
    await Orders.createIndex({ Order_Number: 1 });
    await Orders.createIndex({ Order_uuid: 1 });
    await Orders.createIndex({ Customer_uuid: 1 });

    // Status queries
    await Orders.createIndex({ "Status.Task": 1, "Status.Status_number": 1 });

    // Steps vendor filtering
    await Orders.createIndex({ "Steps.vendorId": 1, "Steps.posting.isPosted": 1 });

    // Bill/no-bill detection
    await Orders.createIndex({ "Items.Amount": 1 });

    // Optional: text index if you want free-text search on remarks
    // await Orders.createIndex({ "Items.Remark": "text" });

    console.log("✅ Indexes created successfully.");
    await mongoose.disconnect();
  } catch (e) {
    console.error("❌ Index creation failed:", e);
    process.exit(1);
  }
})();
