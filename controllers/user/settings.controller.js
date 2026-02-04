const User = require('../../models/user.model');
const bcrypt = require('bcrypt');

const getSettingsPage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.redirect('/login');
        }

        res.render('user/settings', {
            user,
            currentPage: 'settings',
            error: null,
            success: null
        });
    } catch (error) {
        console.error('Error rendering settings page:', error);
        res.status(500).render('error', { message: 'Internal Server Error' });
    }
};

const changePassword = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Validate basic fields
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'New passwords do not match' });
        }

        // Strong password validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.' 
            });
        }

        // Verify current password
        // Note: Google Auth users might not have a password. 
        // If user.password is empty and they are trying to set one, we might need a different flow,
        // but assuming this is for standard users or those who have set a password.
        if (user.password) {
             const isMatch = await bcrypt.compare(currentPassword, user.password);
             if (!isMatch) {
                 return res.status(400).json({ success: false, message: 'Incorrect current password' });
             }
        } else {
            // If user has no password (e.g. only Google Auth), they can't "change" it via this form easily 
            // without a "set password" flow. for now, let's assume they must know the current one if it exists.
            return res.status(400).json({ success: false, message: 'You have not set a password. Please use "Forgot Password" to set one.'});
        }

        // Hash and save new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).json({ success: true, message: 'Password updated successfully' });

    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = {
    getSettingsPage,
    changePassword
};
