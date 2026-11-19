import { Router } from "express";
import { protectAdmin, adminOnly } from "../middleware/authMiddleware.js";
import {
  publicUpdates,
  adminAllUpdates,
  createUpdate,
  updateUpdate,
  publishUpdate,
  deleteUpdate,
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
  sendPushForUpdate,
  sendTestPush
} from "../controllers/pujaUpdateController.js";

const router = Router();

// Public routes for puja updates & push subscriptions
router.get("/", publicUpdates);
router.get("/admin/all", protectAdmin, adminOnly, adminAllUpdates);
router.get("/vapid-key", getVapidPublicKey);
router.post("/subscribe", subscribePush);
router.post("/unsubscribe", unsubscribePush);

// Admin-only management & push triggering
router.post("/test-push", protectAdmin, adminOnly, sendTestPush);
router.post("/:id/send-push", protectAdmin, adminOnly, sendPushForUpdate);
router.post("/:id/publish", protectAdmin, adminOnly, publishUpdate);
router.post("/", protectAdmin, adminOnly, createUpdate);
router.patch("/:id", protectAdmin, adminOnly, updateUpdate);
router.delete("/:id", protectAdmin, adminOnly, deleteUpdate);

export default router;
