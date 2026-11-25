import { Router } from "express";
import { register, login, logout, me, forgotPassword, resetPassword } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";

const router = Router();
router.post("/register", upload.single("UserImg"), register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", protect, me);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// router.post("/bootstrap-admin", bootstrapAdmin);
export default router;
