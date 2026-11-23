
import { Router } from "express";
import { protectAdmin, adminOnly } from "../middleware/authMiddleware.js";

import {
  adminLogin,
  createUserByAdmin,
  setUserActive,
  sendUserPasswordReset,
} from "../controllers/adminController.js";
import { changeAdminPassword } from "../controllers/changePassword.js";

const router = Router();

// Public Admin login
router.post("/login", adminLogin);

// Protected Admin routes
router.use(protectAdmin, adminOnly);

router.post("/users", createUserByAdmin);
router.patch("/users/:id/active", setUserActive);
router.post("/users/:id/password-reset", sendUserPasswordReset);
router.patch("/change-password", changeAdminPassword);

export default router;
