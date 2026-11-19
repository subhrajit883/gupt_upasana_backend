import * as webpush from "web-push";
import PujaUpdate from "../models/PujaUpdate.js";
import PushSubscription from "../models/PushSubscription.js";

const pujaUpdateFields = [
  "title",
  "message",
  // "imageUrl",
  "pujaName",
  "scheduledAt",
  "published",
  "publishedAt",
  "pushStatus",
  "pushProvider",
  "pushPayload",
  "pushError",
  "createdBy"
];

function getPujaUpdateFields(body = {}) {
  return Object.fromEntries(
    pujaUpdateFields
      .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
      .map((field) => [field, body[field]])
  );
}

  // Public: Get published puja updates (or all updates if all=true)
  export async function publicUpdates(req, res) {
    const filter = req.query?.all === "true"
      ? {}
      : {
        published: true,
        $or: [{ scheduledAt: null }, { scheduledAt: { $lte: new Date() } }]
      };
    const updates = await PujaUpdate.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
    .limit(200);
    res.json({ success: true, updates });
  }

  // Admin: Get all puja updates (drafts, published, scheduled)
  export async function adminAllUpdates(_req, res) {
    const updates = await PujaUpdate.find({}).sort({ createdAt: -1 });
    res.json({ success: true, updates });
  }

  // Public: Get VAPID public key for browser push subscription
  export function getVapidPublicKey(_req, res) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return res.status(500).json({ success: false, message: "VAPID public key is not configured" });
    }
    res.json({ success: true, publicKey });
  }

  // Public: Save or update user browser push subscription
  export async function subscribePush(req, res) {
    try {
      const { subscription, userAgent } = req.body;
      if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return res.status(400).json({ success: false, message: "Invalid push subscription object" });
      }

      const updateData = {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime || null,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        userAgent: userAgent || req.headers["user-agent"] || "",
        active: true
      };

      if (req.user?._id) {
        updateData.user = req.user._id;
      }

      const subDoc = await PushSubscription.findOneAndUpdate(
        { endpoint: subscription.endpoint },
        updateData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      res.status(201).json({
        success: true,
        message: "Push subscription registered successfully",
        subscriptionId: subDoc._id
      });
    } catch (error) {
      console.error("Failed to save push subscription:", error);
      res.status(500).json({ success: false, message: "Failed to register subscription" });
    }
  }

  // Public: Unsubscribe from push notifications
  export async function unsubscribePush(req, res) {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ success: false, message: "Endpoint is required" });
      }
      await PushSubscription.findOneAndDelete({ endpoint });
      res.json({ success: true, message: "Unsubscribed from push notifications" });
    } catch (error) {
      console.error("Failed to remove push subscription:", error);
      res.status(500).json({ success: false, message: "Failed to unsubscribe" });
    }
  }

  // Core helper: Send Web Push notifications to all active subscriptions
  export async function sendPushNotificationForUpdate(update) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const email = process.env.VAPID_EMAIL || "mailto:admin@guptupasana.com";

    if (!publicKey || !privateKey) {
      console.warn("VAPID keys not configured; skipping push broadcast");
      return { success: false, sentCount: 0, failedCount: 0, message: "VAPID keys missing" };
    }

    webpush.setVapidDetails(email, publicKey, privateKey);

    const subscriptions = await PushSubscription.find({ active: true });
    if (!subscriptions.length) {
      update.pushStatus = "not_sent";
      update.pushProvider = "web-push";
      update.pushPayload = { subscribersCount: 0 };
      await update.save();
      return { success: true, sentCount: 0, failedCount: 0, message: "No active subscribers" };
    }

    const payload = JSON.stringify({
      title: update.title || "Gupt Upasana - Sacred Puja Update",
      body: update.message,
      icon: "/logo.png",
      badge: "/logo.png",
      url: "/#updates",
      data: {
        updateId: update._id.toString(),
        pujaName: update.pujaName,
        scheduledAt: update.scheduledAt
      }
    });

    const pushOptions = {
      TTL: 86400 * 7, 
      urgency: "high"
    };

    let sentCount = 0;
    let failedCount = 0;
    const expiredEndpoints = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              expirationTime: sub.expirationTime,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth
              }
            },
            payload,
            pushOptions
          );
          sentCount++;
        } catch (err) {
          failedCount++;
          // 404 or 410 indicates the client unsubscribed or the subscription expired
          if (err.statusCode === 404 || err.statusCode === 410) {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      })
    );

    // Clean up dead subscriptions
    if (expiredEndpoints.length) {
      await PushSubscription.deleteMany({ endpoint: { $in: expiredEndpoints } });
    }

    update.pushStatus = sentCount > 0 ? "sent" : (failedCount > 0 ? "failed" : "not_sent");
    update.pushProvider = "web-push";
    update.pushPayload = {
      sentCount,
      failedCount,
      totalSubscribers: subscriptions.length,
      sentAt: new Date()
    };
    await update.save();

    return { success: true, sentCount, failedCount, totalSubscribers: subscriptions.length };
  }

  // Admin: Publish an update and broadcast push notification
  export async function publishUpdate(req, res) {
    const update = await PujaUpdate.findById(req.params.id);
    if (!update) return res.status(404).json({ success: false, message: "Update not found" });

    update.published = true;
    update.publishedAt = new Date();
    update.pushStatus = "queued";
    await update.save();

    // Send push notification to all subscribers
    const pushResult = await sendPushNotificationForUpdate(update);

    res.json({
      success: true,
      update,
      pushResult,
      message: `Published successfully. Push sent to ${pushResult.sentCount || 0} subscriber(s).`
    });
  }

  // Admin: Trigger/re-send push notification for a specific update
  export async function sendPushForUpdate(req, res) {
    const update = await PujaUpdate.findById(req.params.id);
    if (!update) return res.status(404).json({ success: false, message: "Update not found" });

    const pushResult = await sendPushNotificationForUpdate(update);
    res.json({
      success: true,
      message: `Push notification dispatched to ${pushResult.sentCount || 0} device(s).`,
      pushResult
    });
  }

  // Admin: Send instant test push notification
  export async function sendTestPush(req, res) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const email = process.env.VAPID_EMAIL || "mailto:admin@guptupasana.com";

    if (!publicKey || !privateKey) {
      return res.status(500).json({ success: false, message: "VAPID keys not configured" });
    }

    webpush.setVapidDetails(email, publicKey, privateKey);

    const filter = req.body?.endpoint ? { endpoint: req.body.endpoint } : { active: true };
    const subscriptions = await PushSubscription.find(filter);

    if (!subscriptions.length) {
      return res.json({ success: false, message: "No active push subscriptions found to test" });
    }

    const payload = JSON.stringify({
      title: req.body?.title || "🪔 Gupt Upasana - Test Notification",
      body: req.body?.message || "Sacred blessings! Push notifications are working perfectly on your device.",
      icon: "/logo.png",
      badge: "/logo.png",
      url: "/#updates"
    });

    const pushOptions = {
      TTL: 86400 * 7,
      urgency: "high"
    };

    let sent = 0;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            expirationTime: sub.expirationTime,
            keys: sub.keys
          },
          payload,
          pushOptions
        );
        sent++;
      } catch (err) {
        console.error("Test push error:", err.message);
      }
    }

    res.json({ success: true, message: `Test push sent to ${sent} subscriber(s)` });
  }

  export async function createUpdate(req, res) {
    const fields = getPujaUpdateFields(req.body);
    delete fields.createdBy;
    const update = await PujaUpdate.create(fields);
    res.status(201).json({ success: true, update });
  }

  export async function updateUpdate(req, res) {
    const update = await PujaUpdate.findByIdAndUpdate(
      req.params.id,
      getPujaUpdateFields(req.body),
      { new: true, runValidators: true }
    );
    if (!update) return res.status(404).json({ success: false, message: "Update not found" });
    res.json({ success: true, update });
  }

  export async function deleteUpdate(req, res) {
    const update = await PujaUpdate.findByIdAndDelete(req.params.id);
    if (!update) return res.status(404).json({ success: false, message: "Update not found" });
    res.json({ success: true, message: "Update deleted" });
  }


