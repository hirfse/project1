const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const User = require('../models/user.model');

const resetOtpStore = new Map();
const signupOtpStore = new Map();

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000);
}

async function sendEmail(to, subject, html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  await transporter.sendMail({ to, subject, html });
}

async function generateSignupOTP(email) {
  const otp = generateOtp();
  const cleanEmail = email.trim().toLowerCase();

  signupOtpStore.set(cleanEmail, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

  await sendEmail(
    cleanEmail,
    'U-Craft Signup OTP',
    `<h2>Your Signup OTP is: ${otp}</h2>`
  );

  return { otp };
}

async function generateResetOTP(email) {
  const otp = generateOtp();
  resetOtpStore.set(email, { otp, expiresAt: Date.now() + 60000 });
  await sendEmail(email, 'U-Craft password Reset OTP', `<p>Your OTP is: <strong>${otp}</strong></p>`);
  return { otp };
}

function verifySignupOTP(email, otp) {

  const cleanEmail = email.trim().toLowerCase();   

  if (!signupOtpStore.has(cleanEmail))
    return { valid: false, reason: 'missing' };

  const data = signupOtpStore.get(cleanEmail);

  if (Date.now() > data.expiresAt) {
    signupOtpStore.delete(cleanEmail);
    return { valid: false, reason: 'expired' };
  }

  if (String(data.otp) !== String(otp))
    return { valid: false, reason: 'mismatch' };

  signupOtpStore.delete(cleanEmail);
  return { valid: true };
}

function verifyResetOTP(email, otp) {
  if (!resetOtpStore.has(email)) return { valid: false, reason: 'missing' };
  const data = resetOtpStore.get(email);
  if (Date.now() > data.expiresAt) { resetOtpStore.delete(email); return { valid: false, reason: 'expired' }; }
  if (String(data.otp) !== String(otp)) return { valid: false, reason: 'mismatch' };
  resetOtpStore.delete(email);
  return { valid: true };
}

async function authenticate(email, password) {
  const user = await User.findOne({ email });
  if (!user) return { success: false, code: 'INVALID_CREDENTIALS' };
  if (user.isBlocked) return { success: false, code: 'ACCOUNT_BLOCKED' };
  if (!user.password) return { success: false, code: 'USE_GOOGLE_AUTH' };
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return { success: false, code: 'INVALID_CREDENTIALS' };
  return { success: true, user };
}

async function createUserWithReferral({ fullName, email, phone, password, referralCode }) {
  const hashedPassword = await bcrypt.hash(password, 10);
  let referredById = null;
  if (referralCode) {
    const referrer = await User.findOne({ referralCode }).lean();
    if (referrer && referrer.email.toLowerCase() !== email.toLowerCase()) {
      referredById = referrer._id;
    }
  }
  const newUser = new User({
    fullName,
    email,
    phone,
    password: hashedPassword,
    role: 'user',
    status: 'active',
    referredBy: referredById
  });
  await newUser.save();
  return newUser;
}

async function updatePassword(email, newPassword) {
  const user = await User.findOne({ email });
  if (!user) return { success: false, code: 'USER_NOT_FOUND' };
  const hashed = await bcrypt.hash(newPassword, 10);
  user.password = hashed;
  await user.save();
  return { success: true };
}

module.exports = {
  generateSignupOTP,
  generateResetOTP,
  verifySignupOTP,
  verifyResetOTP,
  authenticate,
  createUserWithReferral,
  updatePassword
};
