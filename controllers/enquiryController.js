import mongoose from "mongoose";
import Enquiry from "../models/Enquiry.js";

const enquiryFields = [
  "message",
  "visitDate",
  "type",
  "companyName",
  "authorisedContact",
  "designation",
  "sankalp",
  "reasonForVisit",
];

function pickEnquiryFields(body, includeVisitStatus = false) {
  const fields = includeVisitStatus ? [...enquiryFields, "visitStatus"] : enquiryFields;
  return Object.fromEntries(
    fields
      .filter((field) => body[field] !== undefined)
      .map((field) => [field, body[field]])
  );
}

function validId(id, res) {
  if (mongoose.isValidObjectId(id)) return true;
  res.status(400).json({ success: false, message: "Invalid enquiry ID" });
  return false;
}

export async function createEnquiry(req, res) {
  const enquiry = await Enquiry.create({
    ...pickEnquiryFields(req.body),
    user: req.user._id,
  });
  res.status(201).json({ success: true, enquiry });
}

export async function myEnquiries(req, res) {
  const enquiries = await Enquiry.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, enquiries });
}

export async function allEnquiries(_req, res) {
  const enquiries = await Enquiry.find()
    .populate("user", "name phone email")
    .sort({ createdAt: -1 })
    .limit(500);
  res.json({ success: true, enquiries });
}

export async function getEnquiry(req, res) {
  if (!validId(req.params.id, res)) return;
  const enquiry = await Enquiry.findById(req.params.id).populate("user", "name phone email");
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
  res.json({ success: true, enquiry });
}

export async function updateEnquiry(req, res) {
  if (!validId(req.params.id, res)) return;
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });

  enquiry.set(pickEnquiryFields(req.body, true));
  await enquiry.save();
  res.json({ success: true, enquiry });
}

export async function deleteEnquiry(req, res) {
  if (!validId(req.params.id, res)) return;
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });

  await enquiry.deleteOne();
  res.json({ success: true, message: "Enquiry deleted" });
}
