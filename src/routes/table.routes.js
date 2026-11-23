// routes/table.routes.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const tableController = require("../controllers/table.controller");

// View tables (authenticated users & admins)
router.get("/", authMiddleware, tableController.getAllTables);


// Live occupancy grid for Admin floor view
router.get(
  "/occupancy",
  authMiddleware,
  roleMiddleware("ADMIN"),
  tableController.getTableOccupancy
);


// Admin Table CRUD
router.post(
  "/",
  authMiddleware,
  roleMiddleware("ADMIN"),
  tableController.createTable
);

router.patch(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  tableController.updateTable
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  tableController.deleteTable
);

module.exports = router;