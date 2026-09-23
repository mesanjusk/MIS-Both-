const mongoose = require("mongoose");
const logger = require("../utils/logger");
const { ensureSchemaIntegrityIndexes } = require('../services/schemaIntegrityIndexService');

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    logger.fatal("MONGO_URI is not set in environment. Exiting.");
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === "production";

  try {
    await mongoose.connect(mongoURI, {
      autoIndex: !isProduction,
    });

    if (!isProduction) {
      await mongoose.connection.syncIndexes();
      logger.info("MongoDB connected and indexes synced");
    } else {
      // Production intentionally keeps autoIndex off, but the new integrity
      // indexes are partial on additive fields and therefore exclude untouched
      // legacy rows. Create only those safe indexes explicitly so newly-created
      // data is protected immediately without migrating historical records.
      await ensureSchemaIntegrityIndexes();
      logger.info("MongoDB connected");
    }
  } catch (error) {
    logger.fatal({ err: error }, "MongoDB connection failed");
    process.exit(1);
  }
};

module.exports = connectDB;
