"use strict";

const ok = (res, data = {}, statusCode = 200) =>
  res.status(statusCode).json({ success: true, ...data });

const fail = (res, message = "Server error", statusCode = 500) =>
  res.status(statusCode).json({ success: false, message });

const notFound = (res, message = "Not found") => fail(res, message, 404);
const badRequest = (res, message = "Bad request") => fail(res, message, 400);

module.exports = { ok, fail, notFound, badRequest };
