
import User from "../models/User.js";
import { generateToken, setAuthCookie } from "../utils/generateToken.js";

export async function register(req, res) {
  const {
    name,
    phone,
    email,
    password,
    address,
    type,
  } = req.body;

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

  // Create donor account
  const user = await User.create({
    name,
    phone,
    email,
    password,
    address,
    type,
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

// Public user information
function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    address: user.address,
    type: user.type,
  };
}
