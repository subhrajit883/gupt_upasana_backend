
import User from "../models/User.js";
import { generateToken, setAuthCookie } from "../utils/generateToken.js";
import { createHash } from "node:crypto";
import { emailPasswordResetLink } from "../utils/passwordReset.js";

export async function register(req, res) {
  const {
    name,
    phone,
    email,
    password,
    address,
    type,
    UserImg,
    companyName,
    authorisedContact,
    designation,
    sankalp,
    reasonForVisit,
  } = req.body || {};

  if (!name || !phone || !password) {
    return res.status(400).json({
      success: false,
      message: "name, phone and password are required",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  const exists = await User.findOne({
    $or: [
      { phone },
      ...(email ? [{ email: email.toLowerCase() }] : []),
    ],
  });

  if (exists) {
    return res.status(409).json({
      success: false,
      message: "Phone or email already registered",
    });
  }

  const userImage = req.file
    ? { url: req.file.path, publicId: req.file.filename }
    : UserImg;

  // Create donor account
  const user = await User.create({
    name,
    phone,
    email,
    password,
    address,
    type,
    UserImg: userImage,
    companyName,
    authorisedContact,
    designation,
    sankalp,
    reasonForVisit,
  });

  const token = generateToken(user);

  setAuthCookie(res, token);

  res.status(201).json({
    success: true,
    token,
    user: publicUser(user),
  });
}

export async function login(req, res) {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      message: "identifier and password are required",
    });
  }

  const user = await User.findOne({
    $or: [
      { phone: identifier },
      { email: identifier.toLowerCase() },
    ],
  }).select("+password");

  if (
    !user ||
    !user.isActive ||
    !(await user.comparePassword(password))
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  const token = generateToken(user);

  setAuthCookie(res, token);

  res.json({
    success: true,
    token,
    user: publicUser(user),
  });
}

export async function logout(_req, res) {
  res.clearCookie("token");

  res.json({
    success: true,
    message: "Logged out",
  });
}

export async function me(req, res) {
  res.json({
    success: true,
    user: publicUser(req.user),
  });
}

export async function forgotPassword(req, res) {
  const email = typeof req.body.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "";

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  const user = await User.findOne({ email, isActive: true });
  if (user) {
    await emailPasswordResetLink(user);
  }

  res.json({
    success: true,
    message: "If an active account uses that email, a password reset link has been sent",
  });
}

export async function resetPassword(req, res) {
  const { token, newPassword } = req.body;

  if (typeof token !== "string" || typeof newPassword !== "string" || !token || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Token and new password are required",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  const hashedToken = createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
    isActive: true,
  }).select("+passwordResetToken +passwordResetExpires +password");

  if (!user) {
    return res.status(400).json({
      success: false,
      message: "Password reset token is invalid or has expired",
    });
  }

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({
    success: true,
    message: "Password has been reset successfully",
  });
}

// Public user information
function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    address: user.address,
    UserImg: user.UserImg,
    type: user.type,
    companyName: user.companyName,
    authorisedContact: user.authorisedContact,
    designation: user.designation,
    sankalp: user.sankalp,
    reasonForVisit: user.reasonForVisit,
  };
}
