import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import Booking from "../models/Booking.js";
import Donation from "../models/Donation.js";
import DonationPackage from "../models/DonationPackage.js";
import sendEmail from "../utils/sendEmail.js";

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const error = new Error("Razorpay credentials are not configured");
    error.statusCode = 500;
    throw error;
  }
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}
function makeReceiptNo() {
  return `PUJA-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
function donorSnapshot(user) {
  return { name: user.name, phone: user.phone, email: user.email, address: user.address, city: user.city, state: user.state, type: user.type };
}
function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * POST /api/donations/create-order
 * Body: { packageId?, amount, amountOptionId?, purpose?, donorMessage?, anonymous?, bookingId?, pujaName?, pujaDate?, slot?, devotees?, sankalp?, sankalpPurpose?, specialRequest?, preferredPujaLocation? }
 * A booking is created automatically unless an unlinked bookingId is supplied.
 * The server calculates/validates amount. Never trust amount sent by frontend for fixed packages.
 */
export async function createDonationOrder(req, res) {
  const {
    packageId,
    amount,
    amountOptionId,
    purpose,
    donorMessage,
    anonymous,
    bookingId,
    pujaName,
    pujaDate,
    slot,
    devotees,
    sankalp,
    sankalpPurpose,
    specialRequest,
    preferredPujaLocation,
  } = req.body;
  let selectedPackage = null;
  let finalAmount = Number(amount);

  if (packageId) {
    selectedPackage = await DonationPackage.findById(packageId);
    if (!selectedPackage || !selectedPackage.active) return res.status(400).json({ success: false, message: "Invalid or inactive package" });
    const now = new Date();
    if (selectedPackage.category === "dynamic" && (now < selectedPackage.startDate || now > selectedPackage.endDate)) {
      return res.status(400).json({ success: false, message: "Dynamic package is outside its active date range" });
    }
    if (selectedPackage.category === "static") {
      if (selectedPackage.allowCustomAmount) {
        if (!Number.isFinite(finalAmount) || finalAmount < selectedPackage.minAmt || finalAmount > selectedPackage.maxAmt) {
          return res.status(400).json({ success: false, message: `Amount must be between ${selectedPackage.minAmt} and ${selectedPackage.maxAmt}` });
        }
      } else {
        const option = selectedPackage.amounts.id(amountOptionId);
        if (!option) return res.status(400).json({ success: false, message: "Select a valid package amount option" });
        finalAmount = option.amount;
      }
    }
  }

  if (!Number.isFinite(finalAmount) || finalAmount <= 0 || finalAmount > 10000000) {
    return res.status(400).json({ success: false, message: "Donation amount must be between ₹1 and ₹1,00,00,000" });
  }

  let existingBooking = null;
  if (bookingId) {
    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid booking ID" });
    }
    existingBooking = await Booking.findOne({ _id: bookingId, user: req.user._id });
    if (!existingBooking) return res.status(404).json({ success: false, message: "Booking not found" });
    if (existingBooking.donation) return res.status(409).json({ success: false, message: "Booking is already linked to a donation" });
  }

  const currency = process.env.RAZORPAY_CURRENCY || "INR";
  const donation = await Donation.create({
    donor: req.user._id, donorSnapshot: donorSnapshot(req.user),
    donationPackage: selectedPackage?._id, packageNameSnapshot: selectedPackage?.name,
    amount: finalAmount, currency, paymentStatus: "created",
    purpose, donorMessage, anonymous: Boolean(anonymous), booking: existingBooking?._id,
    receiptNo: makeReceiptNo()
  });

  let createdBooking = null;
  try {
    const order = await razorpayClient().orders.create({
      amount: Math.round(finalAmount * 100), // Razorpay amount is in paise
      currency,
      receipt: donation.receiptNo,
      notes: { donationId: donation._id.toString(), donorId: req.user._id.toString(), packageName: selectedPackage?.name || "General donation" }
    });

    if (existingBooking) {
      existingBooking.donation = donation._id;
      await existingBooking.save();
    } else {
      createdBooking = await Booking.create({
        bookingNo: `BK-${Date.now()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
        user: req.user._id,
        pujaName: pujaName ?? "",
        pujaDate: pujaDate || null,
        slot: slot ?? "",
        devotees: Array.isArray(devotees) ? devotees : [],
        sankalp: sankalp ?? "",
        sankalpPurpose: sankalpPurpose ?? "",
        specialRequest: specialRequest ?? "",
        preferredPujaLocation: preferredPujaLocation ?? "",
        donation: donation._id,
      });
      donation.booking = createdBooking._id;
    }

    donation.razorpayOrderId = order.id;
    donation.paymentStatus = "pending";
    await donation.save();

    res.status(201).json({
      success: true,
      donationId: donation._id,
      bookingId: donation.booking,
      order: { id: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt },
      razorpay: { keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, currency: order.currency },
      donor: { name: req.user.name, email: req.user.email, contact: req.user.phone }
    });
  } catch (error) {
    if (createdBooking) {
      try {
        await createdBooking.deleteOne();
      } catch (cleanupError) {
        console.error(`Failed to remove booking ${createdBooking._id} after donation order failure:`, cleanupError);
      }
    }
    if (existingBooking?.donation?.toString() === donation._id.toString()) {
      existingBooking.donation = undefined;
      try {
        await existingBooking.save();
      } catch (cleanupError) {
        console.error(`Failed to unlink booking ${existingBooking._id} after donation order failure:`, cleanupError);
      }
    }
    donation.booking = undefined;
    donation.paymentStatus = "failed";
    donation.failureReason = error.message;
    await donation.save();
    throw error;
  }
}

/**
 * POST /api/donations/verify-payment
 * Body: { donationId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Checkout signature verification is mandatory. Webhook is the reliable async backup.
 */
export async function verifyDonationPayment(req, res) {
  const { donationId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!donationId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: "Missing payment verification fields" });
  }
  const donation = await Donation.findOne({ _id: donationId, donor: req.user._id });
  if (!donation) return res.status(404).json({ success: false, message: "Donation not found" });
  if (donation.razorpayOrderId !== razorpay_order_id) return res.status(400).json({ success: false, message: "Order ID mismatch" });
  if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    donation.paymentStatus = "failed";
    donation.failureReason = "Checkout signature verification failed";
    await donation.save();
    return res.status(400).json({ success: false, message: "Invalid Razorpay signature" });
  }

  // Confirm payment details from Razorpay API as an additional check.
  const payment = await razorpayClient().payments.fetch(razorpay_payment_id);
  if (payment.order_id !== razorpay_order_id || payment.amount !== Math.round(donation.amount * 100) || payment.currency !== donation.currency) {
    return res.status(400).json({ success: false, message: "Razorpay payment details do not match donation" });
  }
  if (payment.status !== "captured") {
    return res.status(409).json({ success: false, message: `Payment is ${payment.status}; donation is not marked paid` });
  }

  await markDonationPaid(donation, payment.id, razorpay_signature, payment.created_at);
  res.json({ success: true, message: "Payment verified", donation: await Donation.findById(donation._id) });
}

export async function razorpayWebhook(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ success: false, message: "Webhook secret is not configured" });
  const signature = req.headers["x-razorpay-signature"];
  const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(400).json({ success: false, message: "Invalid webhook signature" });
  }

  const event = JSON.parse(req.body.toString("utf8"));
  const payment = event.payload?.payment?.entity;
  if (event.event === "payment.captured" && payment) {
    const donation = await Donation.findOne({ razorpayOrderId: payment.order_id });
    if (donation && payment.amount === Math.round(donation.amount * 100) && payment.currency === donation.currency) {
      await markDonationPaid(donation, payment.id, undefined, payment.created_at);
    }
  } else if (event.event === "payment.failed" && payment) {
    await Donation.findOneAndUpdate(
      { razorpayOrderId: payment.order_id, paymentStatus: { $ne: "paid" } },
      { paymentStatus: "failed", failureReason: payment.error_description || payment.error_reason || "Payment failed" }
    );
  }
  // Razorpay retries if a non-2xx response is returned. Acknowledge processed event.
  res.json({ received: true });
}

async function markDonationPaid(donation, paymentId, signature, createdAt) {
  if (donation.paymentStatus !== "paid") {
    donation.paymentStatus = "paid";
    donation.razorpayPaymentId = paymentId;
    if (signature) donation.razorpaySignature = signature;
    donation.paymentCapturedAt = createdAt ? new Date(createdAt * 1000) : new Date();
    donation.receiptGenerated = true;
    await donation.save();
  }

  const email = donation.donorSnapshot?.email;
  if (!email) {
    console.warn(`Cannot send donation thank-you email: donor email is missing for donation ${donation._id}`);
    return donation;
  }

  const claimExpiredBefore = new Date(Date.now() - 5 * 60 * 1000);
  const claimAt = new Date();
  const claimedDonation = await Donation.findOneAndUpdate(
    {
      _id: donation._id,
      thankYouEmailSentAt: { $exists: false },
      $or: [
        { thankYouEmailClaimedAt: { $exists: false } },
        { thankYouEmailClaimedAt: { $lt: claimExpiredBefore } }
      ]
    },
    { $set: { thankYouEmailClaimedAt: claimAt } },
    { new: true }
  );
  if (!claimedDonation) return donation;

  try {
    const name = claimedDonation.donorSnapshot.name?.trim() || "there";
    const escapedName = name.replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
    const amount = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: claimedDonation.currency
    }).format(claimedDonation.amount);
    const receipt = claimedDonation.receiptNo ? ` Receipt number: ${claimedDonation.receiptNo}.` : "";

    // await sendEmail({
    //   to: email,
    //   subject: "Thank you for your donation",
    //   text: `Thank you for your donation of ${amount}, ${name}. We are grateful for your generous support.`,
    //   html: `<p>Thank you for your donation of ${amount}, ${escapedName}. We are grateful for your generous support.</p>`
    // });

await sendEmail({
    to: email,
    subject: "🙏 Thank You for Your Sacred Offering | Gupt Upasana",
    text: `Dear ${name},

Thank you for your generous donation of ₹${amount} to Gupt Upasana.

Your contribution is more than a donation—it is a heartfelt offering made with faith, devotion, and kindness. Every contribution helps us continue our spiritual initiatives, sacred rituals, and efforts to bring people closer to divine blessings.

We are truly grateful that you chose to be a part of this journey with us. May the divine grace of the Almighty bring peace to your heart, positivity to your home, strength to your family, and prosperity in every step of your life.

May your devotion always guide you towards peace, and may your life be filled with blessings.

With gratitude and prayers,
Team Gupt Upasana
https://guptupasana.in

This email is a confirmation of your donation.`,

    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>

    <body style="margin:0; padding:0; background-color:#f7f3e9; font-family:Arial, Helvetica, sans-serif;">

        <div style="padding:35px 15px;">

            <div style="max-width:620px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 30px rgba(74,10,13,0.08);">

                <!-- HEADER -->
                <div style="background:#4a0a0d; padding:35px 25px; text-align:center;">

                    <div style="font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#e7c66b; margin-bottom:12px;">
                        With Faith & Gratitude
                    </div>

                    <h1 style="margin:0; color:#e7c66b; font-size:28px; font-weight:700; letter-spacing:1px;">
                        Gupt Upasana
                    </h1>

                    <p style="margin:12px 0 0; color:#f7e8bd; font-size:14px; line-height:1.7;">
                        A Sacred Offering. A Heartfelt Prayer.
                    </p>

                </div>

                <!-- GOLD DIVIDER -->
                <div style="height:4px; background:#e7c66b;"></div>

                <!-- BODY -->
                <div style="padding:35px 32px;">

                    <h2 style="color:#4a0a0d; font-size:24px; margin:0 0 20px; text-align:center;">
                        Thank You for Your Generosity 🙏
                    </h2>

                    <p style="font-size:15px; color:#444444; line-height:1.9; margin:0 0 18px;">
                        Dear <strong>${escapedName}</strong>,
                    </p>

                    <p style="font-size:15px; color:#444444; line-height:1.9; margin:0 0 18px;">
                        Thank you for making a generous donation of
                        <strong style="color:#4a0a0d;">${amount}</strong>
                        to <strong>Gupt Upasana</strong>.
                    </p>

                    <p style="font-size:15px; color:#444444; line-height:1.9; margin:0 0 18px;">
                        Your contribution is more than a donation—it is a heartfelt offering made with faith, devotion, and kindness.
                        Every offering, big or small, carries the spirit of prayer and helps us continue our sacred initiatives,
                        spiritual activities, and efforts to bring people closer to the divine.
                    </p>

                    <p style="font-size:15px; color:#444444; line-height:1.9; margin:0 0 18px;">
                        We sincerely appreciate you being a part of this spiritual journey.
                        May the divine grace of the Almighty bring peace to your heart,
                        positivity to your home, strength to your family, and prosperity to your life.
                    </p>

                    <p style="font-size:15px; color:#444444; line-height:1.9; margin:0 0 25px;">
                        May your faith remain strong, your prayers find peace, and your path always be illuminated by divine blessings.
                    </p>

                    <!-- CLOSING -->
                    <div style="border-top:1px solid #eee5d3; padding-top:22px;">

                        <p style="font-size:15px; color:#4a0a0d; line-height:1.8; margin:0;">
                            With heartfelt gratitude and prayers,
                        </p>

                        <p style="font-size:19px; color:#4a0a0d; font-weight:bold; margin:8px 0 4px;">
                            Team Gupt Upasana
                        </p>

                    </div>

                </div>

                <!-- FOOTER -->
                <div style="background:#4a0a0d; padding:25px 20px; text-align:center;">

                    <p style="margin:0 0 10px; color:#e7c66b; font-size:14px; font-weight:bold;">
                        Gupt Upasana
                    </p>

                    <p style="margin:0 0 15px; color:#f0dfb3; font-size:12px; line-height:1.8;">
                        Faith • Devotion • Spirituality
                    </p>

                    <a href="https://guptupasana.in"
                       style="color:#e7c66b; font-size:13px; text-decoration:none;">
                        Visit Our Website
                    </a>

                    <p style="margin:20px 0 0; color:#a98754; font-size:11px; line-height:1.7;">
                        This email confirms your donation to Gupt Upasana.<br/>
                        Thank you for your faith and generosity.
                    </p>

                </div>

            </div>

        </div>

    </body>
    </html>
    `
});



    const result = await Donation.updateOne(
      { _id: claimedDonation._id, thankYouEmailClaimedAt: claimAt },
      { $set: { thankYouEmailSentAt: new Date() }, $unset: { thankYouEmailClaimedAt: 1 } }
    );
    if (result.matchedCount !== 1) {
      throw new Error(`Could not record thank-you email delivery for donation ${claimedDonation._id}`);
    }
  } catch (error) {
    try {
      await Donation.updateOne(
        { _id: claimedDonation._id, thankYouEmailClaimedAt: claimAt },
        { $unset: { thankYouEmailClaimedAt: 1 } }
      );
    } catch (releaseError) {
      console.error(`Failed to release donation thank-you email claim for donation ${claimedDonation._id}:`, releaseError);
    }
    throw error;
  }

  // Receipt number is allocated at order creation; generate/store PDF URL separately if desired.
  return donation;
}

export async function myDonations(req, res) {
  const donations = await Donation.find({ donor: req.user._id }).populate("donationPackage", "name category").sort({ createdAt: -1 });
  res.json({ success: true, donations });
}
export async function getDonation(req, res) {
  const donation = await Donation.findById(req.params.id).populate("donor", "name phone email").populate("donationPackage", "name");
  if (!donation) return res.status(404).json({ success: false, message: "Donation not found" });
  if (req.user.role !== "admin" && donation.donor._id.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: "Forbidden" });
  res.json({ success: true, donation });
}
export async function adminDonations(req, res) {
  const { status, userId, from, to } = req.query;
  const filter = {};
  if (status) filter.paymentStatus = status;
  if (userId) filter.donor = userId;
  if (from || to) filter.createdAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  const donations = await Donation.find().populate("donor", "name phone email").sort({ createdAt: -1 }).limit(500);
  res.json({ success: true, count: donations.length, donations });
}
export async function donationSummary(_req, res) {
  const [totals, count, donors] = await Promise.all([
    Donation.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, totalAmount: { $sum: "$amount" } } }]),
    Donation.countDocuments({ paymentStatus: "paid" }),
    Donation.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: "$donor", total: { $sum: "$amount" }, count: { $sum: 1 } } }, { $sort: { total: -1 } }, { $limit: 100 }])
  ]);
  res.json({ success: true, totalAmount: totals[0]?.totalAmount || 0, paidDonationCount: count, donorTotals: donors });
}
