const User = require('../../models/user.model');
const Category = require('../../models/category.model');
const { INDIAN_STATES } = require('../../constants/indiaStates');
const nodemailer = require('nodemailer');

// Local OTP store for email verification
const emailOtpStore = new Map();

function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000);
}

exports.getProfile = async (req, res) => {
    const userId = req.session.userId;
    const user = await User.findOne({ _id: userId }).lean();
    if (user) {
        // Add properties expected by the header partial
        user.userName = user.fullName;
        user.userProfile = user.profileImage;
    }
    res.render('user/profile', { user });
};

exports.getEditProfile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findOne({ _id: userId });
        if (!user) {
            return res.render('user/error', {
                message: 'User not found',
                userName: req.session.userName || null,
                categories: await Category.find({ isListed: true })
            });
        }
        res.render('user/editProfile', {
            user,
            userName: req.session.userName || null,
            error: null,
            categories: await Category.find({ isListed: true })
        });
    } catch (error) {
        console.error('Error fetching edit profile:', error);
        res.render('user/error', {
            message: 'Failed to load edit profile page',
            userName: req.session.userName || null,
            categories: await Category.find({ isListed: true })
        });
    }
};

// Edit Profile (with email OTP verification)
exports.editProfile = async (req, res) => {
    try {
        const userId = req.params.id;
        const { fullName, email } = req.body;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!fullName.trim()) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        if (!email.trim()) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Check if email is changed (normalize for comparison)
        const normalizedNewEmail = email.trim().toLowerCase();
        const normalizedCurrentEmail = user.email.trim().toLowerCase();

        console.log(`Email comparison: new="${normalizedNewEmail}", current="${normalizedCurrentEmail}"`);

        if (normalizedNewEmail !== normalizedCurrentEmail) {
            const existingUser = await User.findOne({ email: normalizedNewEmail });
            if (existingUser) {
                return res.status(400).json({ success: false, message: 'Email already exists' });
            }

            // Generate OTP and store in email OTP store
            const otp = generateOTP();
            console.log(`OTP for ${email}: ${otp}`); // Log OTP to console
            emailOtpStore.set(email, { otp, expiresAt: Date.now() + 60000 });
            req.session.pendingProfileUpdate = { fullName, email, profileImage: req.file ? req.file.filename : user.profileImage };

            // Send OTP to new email
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            try {
                await transporter.sendMail({
                    to: email,
                    subject: 'U-Craft Email Verification OTP',
                    html: `<p>Hi, your OTP for email verification is: <strong>${otp}</strong></p>`
                });
            } catch (emailError) {
                console.error('Error sending OTP email:', emailError);
                return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
            }

            return res.json({ success: true, redirect: `/verify-email-otp?email=${encodeURIComponent(email)}` });
        }

        // Update name and profile image if email is unchanged
        user.fullName = fullName;
        if (req.file) {
            // Save only the filename, not the full path
            user.profileImage = req.file.filename;
        }
        await user.save();

        req.session.userName = fullName; // Update session
        return res.json({ success: true, redirect: '/profile' });
    } catch (error) {
        console.error('Error editing profile:', error);
        return res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
};

exports.getVerifyEmailOTP = async (req, res) => {
    try {
        const { email } = req.query;
        console.log(`getVerifyEmailOTP called with email: ${email}`);
        console.log(`Query params:`, req.query,);

        if (!email) {
            console.log(`No email provided, redirecting to profile edit`);
            return res.redirect('/profile/edit');
        }

        console.log(`Rendering verifyEmailOTP page for email: ${email}`);
        res.render('user/verifyEmailOTP', {
            email,
            userName: req.session.userName || null,
            error: null,
            categories: await Category.find({ isListed: true })
        });
    } catch (error) {
        console.error('Error loading OTP page:', error);
        res.render('user/error', {
            message: 'Failed to load email verification page',
            userName: req.session.userName || null,
            categories: await Category.find({ isListed: true })
        });
    }
};

// Verify Email OTP
exports.verifyEmailOTP = async (req, res) => {
    try {
        console.log(`verifyEmailOTP called`);
        console.log(`Request body:`, req.body);
        console.log(`Request headers:`, req.headers);
        console.log(`Request method:`, req.method);

        const { email, otp } = req.body;
        const userId = req.session.userId;

        console.log(`Verifying OTP for email: ${email}, OTP: ${otp}, userId: ${userId}`);
        console.log(`Email OTP Store has email: ${emailOtpStore.has(email)}`);
        console.log(`Email OTP Store contents:`, Array.from(emailOtpStore.entries()));

        if (!emailOtpStore.has(email)) {
            console.log(`OTP not found in store for email: ${email}`);
            return res.status(400).json({ success: false, message: 'OTP expired or invalid' });
        }

        const storedOTPData = emailOtpStore.get(email);
        console.log(`Stored OTP data:`, storedOTPData);
        console.log(`Current time: ${Date.now()}, Expires at: ${storedOTPData.expiresAt}`);

        if (Date.now() > storedOTPData.expiresAt) {
            console.log(`OTP expired for email: ${email}`);
            emailOtpStore.delete(email);
            return res.status(400).json({ success: false, message: 'OTP expired. Please try again.' });
        }

        console.log(`Comparing OTPs: stored="${storedOTPData.otp}", provided="${otp}"`);
        if (storedOTPData.otp.toString() !== otp.toString()) {
            console.log(`OTP mismatch for email: ${email}`);
            return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Update user with pending changes
        const pendingUpdate = req.session.pendingProfileUpdate;
        console.log(`Pending update data:`, pendingUpdate);

        if (pendingUpdate) {
            console.log(`Updating user: ${user.email} -> ${pendingUpdate.email}`);
            user.fullName = pendingUpdate.fullName;
            user.email = pendingUpdate.email;
            if (pendingUpdate.profileImage) {
                user.profileImage = pendingUpdate.profileImage;
            }
            req.session.userName = pendingUpdate.fullName;
            req.session.userEmail = pendingUpdate.email;
            delete req.session.pendingProfileUpdate;
        }
        await user.save();
        console.log(`User updated successfully with new email: ${user.email}`);

        emailOtpStore.delete(email);
        return res.json({ success: true, redirect: '/profile' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({ success: false, message: 'Failed to verify OTP' });
    }
};

//reset password page
exports.resendEmailOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const user = await User.findOne({ email: req.session.userEmail });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Generate new OTP
        const otp = generateOTP();
        console.log(`Resent OTP for ${email}: ${otp}`); // Log OTP to console
        emailOtpStore.set(email, { otp, expiresAt: Date.now() + 60000 });

        // Send OTP to email
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        try {
            await transporter.sendMail({
                to: email,
                subject: 'U-Craft Email Verification OTP',
                html: `<p>Hi, your new OTP for email verification is: <strong>${otp}</strong></p>`
            });
        } catch (emailError) {
            console.error('Error resending OTP email:', emailError);
            return res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again.' });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Error resending OTP:', error);
        return res.status(500).json({ success: false, message: 'Failed to resend OTP' });
    }
};


const Address = require('../../models/address.model')

exports.getAddresses = async (req, res) => {
    try {
        const userId = req.session.userId;
        const addressDoc = await Address.findOne({ userId });

        if (!addressDoc || !addressDoc.address.length) {
            return res.render('user/address', { address: [], error: 'No addresses found.' });
        }

        res.render('user/address', { address: addressDoc.address, error: null });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.render('user/address', { address: [], error: 'Failed to fetch addresses.' });
    }
};

exports.getAddAddress = (req, res) => {
    res.render('user/addAddress', { error: null, success: null, states: INDIAN_STATES });
};

exports.addAddress = async (req, res) => {
    try {
        const { addressType, fullName, phone, secPhone, houseName, city, state, pincode, landMark } = req.body;
        const userId = req.session.userId;

        // Validate required fields
        if (!addressType || !fullName || !phone || !houseName || !city || !state || !pincode) {
            return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
        }

        const normalizedState = String(state).trim();
        if (!INDIAN_STATES.includes(normalizedState)) {
            return res.status(400).json({ success: false, message: 'Please select a valid Indian state/UT.' });
        }

        let addressDoc = await Address.findOne({ userId });
        const newAddress = {
            addressType,
            fullName,
            phone,
            secPhone,
            houseName,
            city,
            state: normalizedState,
            pincode,
            landMark
        };

        if (addressDoc) {
            addressDoc.address.push(newAddress);
            await addressDoc.save();
        } else {
            addressDoc = new Address({
                userId,
                address: [newAddress]
            });
            await addressDoc.save();
        }

        res.status(200).json({ success: true, message: 'Address added successfully!' });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({ success: false, message: 'Failed to add address. Please try again.' });
    }
};

exports.getEditAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.userId;

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).send('Address not found');
        }

        const address = addressDoc.address.find(addr => addr._id.toString() === id);
        if (!address) {
            return res.status(404).send('Address not found');
        }

        res.render('user/editAddress', { address });
    } catch (error) {
        console.error('Error fetching address for editing:', error);
        res.status(500).send('Failed to fetch address');
    }
};

exports.editAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const { addressType, fullName, phone, secPhone, houseName, city, state, pincode, landMark } = req.body;
        const userId = req.session.userId;

        // Validate required fields
        if (!addressType || !fullName || !phone || !houseName || !city || !state || !pincode) {
            return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === id);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        // Update the specific address while preserving its _id
        addressDoc.address[addressIndex] = {
            ...addressDoc.address[addressIndex]._doc, // Preserve existing fields, including _id
            addressType,
            fullName,
            phone,
            secPhone,
            houseName,
            city,
            state,
            pincode,
            landMark
        };

        await addressDoc.save();
        res.status(200).json({ success: true, message: 'Address updated successfully!' });
    } catch (error) {
        console.error('Error editing address:', error);
        res.status(500).json({ success: false, message: 'Failed to edit address. Please try again.' });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.userId;

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === id);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        addressDoc.address.splice(addressIndex, 1);
        await addressDoc.save();

        res.status(200).json({ success: true, message: 'Address deleted successfully!' });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ success: false, message: 'Failed to delete address. Please try again.' });
    }
};