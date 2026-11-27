import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import ServiceBooking from "../models/ServiceBooking.js";
import ServicePackage from "../models/ServicePackage.js";
import deleteFromCloudinary from "../utils/deleteFromCloudinary.js";

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const error = new Error("Razorpay credentials are not configured");
    error.statusCode = 500;
    throw error;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function makeBookingNo() {
  return `SB-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature || "");
  return expectedBuffer.length === signatureBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

async function cleanupUploadedPhotos(files) {
  const uploadedFiles = Object.values(files).flat();
  await Promise.all(uploadedFiles.map(async file => {
    if (!file.filename) return;
    try {
      await deleteFromCloudinary(file.filename);
    } catch (error) {
      console.error(`Failed to remove uploaded service booking photo ${file.filename}:`, error);
    }
  }));
}

function parseArray(value, field) {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw badRequest(`${field} must be a JSON array`);
    }
  }
  if (!Array.isArray(value)) throw badRequest(`${field} must be an array`);
  return value;
}

function parsePhoto(value) {
  if (!value) return undefined;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      return { url: value };
    }
    return undefined;
  }
  return typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function filePhoto(file) {
  return file ? { url: file.path, publicId: file.filename } : undefined;
}

function preparePeople(value, field, files, photoIndexesValue) {
  const people = parseArray(value, field);
  const photoIndexes = photoIndexesValue === undefined
    ? (files || []).map((_file, index) => index)
    : parseArray(photoIndexesValue, `${field}PhotoIndexes`);
  if (photoIndexes.length !== (files || []).length) {
    throw badRequest(`${field} photo indexes must match the uploaded photos`);
  }
  const photoByPerson = new Map();
  photoIndexes.forEach((index, fileIndex) => {
    if (!Number.isInteger(index) || index < 0 || index >= people.length || photoByPerson.has(index)) {
      throw badRequest(`${field} photo indexes must be unique valid entry indexes`);
    }
    photoByPerson.set(index, files[fileIndex]);
  });
  return people.map((person, index) => {
    if (!person || typeof person !== "object" || Array.isArray(person)) {
      throw badRequest(`Each ${field} entry must be an object`);
    }
    const photo = filePhoto(photoByPerson.get(index)) || parsePhoto(person.photo);
    if (typeof person.name !== "string" || !person.name.trim()) {
      throw badRequest(`${field} entries must include a name`);
    }
    if (field === "familyMembers" && (typeof person.relation !== "string" || !person.relation.trim())) {
      throw badRequest("Family members must include a relation");
    }
    if (person.gotra != null && typeof person.gotra !== "string") {
      throw badRequest(`${field} gotra must be a string`);
    }
    return {
      name: person.name.trim(),
      ...(field === "familyMembers" && { relation: person.relation.trim() }),
      ...(person.gotra?.trim() && { gotra: person.gotra.trim() }),
      photo,
    };
  });
}

function buildBookingData(body, files) {
  const devoteeType = body.devoteeType;
  if (!["individual", "organization"].includes(devoteeType)) {
    throw badRequest("devoteeType must be individual or organization");
  }

  const employees = preparePeople(body.employees, "employees", files?.employeePhotos, body.employeePhotoIndexes);
  const familyMembers = preparePeople(body.familyMembers, "familyMembers", files?.familyPhotos, body.familyPhotoIndexes);
  if (devoteeType === "organization" && familyMembers.length) {
    throw badRequest("Organization bookings cannot include family members");
  }
  if (devoteeType === "individual" && employees.length) {
    throw badRequest("Individual bookings cannot include employees");
  }

  const devoteeName = typeof body.devoteeName === "string" ? body.devoteeName.trim() : "";
  if (!devoteeName) throw badRequest("devoteeName is required");
  const devoteeCompanyName = typeof body.devoteeCompanyName === "string"
    ? body.devoteeCompanyName.trim()
    : "";
  if (devoteeType === "organization" && !devoteeCompanyName) {
    throw badRequest("devoteeCompanyName is required for organization bookings");
  }

  const devoteePhoto = filePhoto(files?.devoteePhoto?.[0]) || parsePhoto(body.devoteePhoto);
  return {
    devoteeName,
    devoteePhoto,
    devoteeType,
    devoteeCompanyName,
    devoteeDesignation: body.devoteeDesignation,
    employees,
    familyMembers,
    traditionalIntention: body.traditionalIntention,
    gotra: body.gotra,
    sankalp: body.sankalp,
    preferredDate: body.preferredDate || undefined,
  };
}

export async function createServiceBookingOrder(req, res) {
  const body = req.body || {};
  const { servicePackageId, serviceAmountId } = body;
  const files = req.files || {};
  let servicePackage;
  let booking;
  let currency;
  try {
    if (!mongoose.isValidObjectId(servicePackageId) || !mongoose.isValidObjectId(serviceAmountId)) {
      throw badRequest("Invalid service package or amount ID");
    }

    servicePackage = await ServicePackage.findOne({
      _id: servicePackageId,
      active: true,
      status: "published",
    });
    if (!servicePackage) throw notFound("Service package not found or unavailable");

    const serviceAmount = servicePackage.serviceAmounts.id(serviceAmountId);
    if (!serviceAmount) throw badRequest("Select a valid service amount");

    const bookingData = buildBookingData(body, files);
    currency = process.env.RAZORPAY_CURRENCY || "INR";
    booking = await ServiceBooking.create({
      ...bookingData,
      bookingNo: makeBookingNo(),
      user: req.user._id,
      servicePackage: servicePackage._id,
      serviceNameSnapshot: servicePackage.serviceName,
      serviceCategorySnapshot: servicePackage.serviceCategory,
      serviceAmountId: serviceAmount._id,
      serviceAmountLabelSnapshot: serviceAmount.label,
      regularPujaFrequency: serviceAmount.frequency,
      amount: serviceAmount.amount,
      currency,
      paymentStatus: "created",
    });
  } catch (error) {
    await cleanupUploadedPhotos(files);
    throw error;
  }

  try {
    const order = await razorpayClient().orders.create({
      amount: Math.round(booking.amount * 100),
      currency,
      receipt: booking.bookingNo,
      notes: {
        serviceBookingId: booking._id.toString(),
        userId: req.user._id.toString(),
        serviceName: servicePackage.serviceName,
      },
    });

    booking.razorpayOrderId = order.id;
    booking.paymentStatus = "pending";
    await booking.save();

    res.status(201).json({
      success: true,
      serviceBookingId: booking._id,
      bookingNo: booking.bookingNo,
      order: { id: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt },
      razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      user: { name: req.user.name, email: req.user.email, contact: req.user.phone },
    });
  } catch (error) {
    booking.paymentStatus = "failed";
    booking.failureReason = error.message;
    await booking.save();
    throw error;
  }
}

export async function verifyServiceBookingPayment(req, res) {
  const { serviceBookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!serviceBookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: "Missing payment verification fields" });
  }
  if (!mongoose.isValidObjectId(serviceBookingId)) {
    return res.status(400).json({ success: false, message: "Invalid service booking ID" });
  }

  const booking = await ServiceBooking.findOne({ _id: serviceBookingId, user: req.user._id });
  if (!booking) return res.status(404).json({ success: false, message: "Service booking not found" });
  if (booking.razorpayOrderId !== razorpay_order_id) {
    return res.status(400).json({ success: false, message: "Order ID mismatch" });
  }
  const razorpay = razorpayClient();
  if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    booking.paymentStatus = "failed";
    booking.failureReason = "Checkout signature verification failed";
    await booking.save();
    return res.status(400).json({ success: false, message: "Invalid Razorpay signature" });
  }

  const payment = await razorpay.payments.fetch(razorpay_payment_id);
  if (payment.order_id !== razorpay_order_id
    || payment.amount !== Math.round(booking.amount * 100)
    || payment.currency !== booking.currency) {
    return res.status(400).json({ success: false, message: "Razorpay payment details do not match service booking" });
  }
  if (payment.status !== "captured") {
    return res.status(409).json({ success: false, message: `Payment is ${payment.status}; service booking is not marked paid` });
  }

  await markServiceBookingPaid(booking, payment.id, razorpay_signature, payment.created_at);
  res.json({
    success: true,
    message: "Payment verified",
    serviceBooking: await ServiceBooking.findById(booking._id),
  });
}

export async function serviceBookingRazorpayWebhook(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ success: false, message: "Webhook secret is not configured" });
  const signature = req.headers["x-razorpay-signature"];
  const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature || "");
  if (expectedBuffer.length !== signatureBuffer.length
    || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return res.status(400).json({ success: false, message: "Invalid webhook signature" });
  }

  const event = JSON.parse(req.body.toString("utf8"));
  const payment = event.payload?.payment?.entity;
  if (event.event === "payment.captured" && payment) {
    const booking = await ServiceBooking.findOne({ razorpayOrderId: payment.order_id });
    if (booking
      && payment.amount === Math.round(booking.amount * 100)
      && payment.currency === booking.currency) {
      await markServiceBookingPaid(booking, payment.id, undefined, payment.created_at);
    }
  } else if (event.event === "payment.failed" && payment) {
    await ServiceBooking.findOneAndUpdate(
      { razorpayOrderId: payment.order_id, paymentStatus: { $ne: "paid" } },
      { paymentStatus: "failed", failureReason: payment.error_description || payment.error_reason || "Payment failed" },
    );
  }
  res.json({ received: true });
}

async function markServiceBookingPaid(booking, paymentId, signature, createdAt) {
  if (booking.paymentStatus === "paid") return booking;
  booking.paymentStatus = "paid";
  booking.razorpayPaymentId = paymentId;
  if (signature) booking.razorpaySignature = signature;
  booking.paymentCapturedAt = createdAt ? new Date(createdAt * 1000) : new Date();
  await booking.save();
  return booking;
}

export async function myServiceBookings(req, res) {
  const bookings = await ServiceBooking.find({ user: req.user._id })
    .populate("servicePackage", "serviceName serviceCategory serviceImg")
    .sort({ createdAt: -1 });
  res.json({ success: true, bookings });
}

export async function getServiceBooking(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid service booking ID" });
  }
  const booking = await ServiceBooking.findById(req.params.id)
    .populate("user", "name phone email")
    .populate("servicePackage", "serviceName serviceCategory serviceImg");
  if (!booking) return res.status(404).json({ success: false, message: "Service booking not found" });
  if (!req.admin && booking.user._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  res.json({ success: true, serviceBooking: booking });
}

export async function allServiceBookings(_req, res) {
  const bookings = await ServiceBooking.find()
    .populate("user", "name phone email")
    .populate("servicePackage", "serviceName serviceCategory")
    .sort({ createdAt: -1 })
    .limit(500);
  res.json({ success: true, count: bookings.length, bookings });
}

export async function updateServiceBookingStatus(req, res) {
  const validStatuses = ["pending", "confirmed", "cancelled", "completed"];
  const { bookingStatus } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid service booking ID" });
  }
  if (!validStatuses.includes(bookingStatus)) {
    return res.status(400).json({
      success: false,
      message: `bookingStatus must be one of: ${validStatuses.join(", ")}`,
    });
  }
  const booking = await ServiceBooking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: "Service booking not found" });
  if (["confirmed", "completed"].includes(bookingStatus) && booking.paymentStatus !== "paid") {
    return res.status(409).json({ success: false, message: "Only paid service bookings can be confirmed or completed" });
  }
  booking.bookingStatus = bookingStatus;
  await booking.save();
  res.json({ success: true, serviceBooking: booking });
}
