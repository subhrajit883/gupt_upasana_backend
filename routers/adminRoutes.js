
import { Router } from "express";
import { protectAdmin, adminOnly } from "../middleware/authMiddleware.js";

import {
  adminLogin,
  createUserByAdmin,
  setUserActive,
} from "../controllers/adminController.js";

const router = Router();

// Public Admin login
router.post("/login", adminLogin);

// Protected Admin routes
router.use(protectAdmin, adminOnly);

router.post("/users", createUserByAdmin);
router.patch("/users/:id/active", setUserActive);

export default router;
