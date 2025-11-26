const Wallet = require('../../models/wallet.model');
const Category = require('../../models/category.model');


exports.getWallet = async (req, res) => {
    try {
        const userId = req.session.userId;
        const categories = await Category.find({ isListed: true });

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Transactions per page

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
            await wallet.save();
        }

        // Sort transactions by date (newest first)
        const sortedTransactions = wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Calculate pagination
        const totalTransactions = sortedTransactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        // Get paginated transactions
        const paginatedTransactions = sortedTransactions.slice(startIndex, endIndex);

        res.render('user/wallet', {
            wallet: {
                balance: wallet.balance,
                transactions: paginatedTransactions
            },
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalTransactions: totalTransactions,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page + 1,
                prevPage: page - 1
            },
            userName: req.session.userName || null,
            categories,
            error: null
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.render('user/wallet', {
            wallet: { balance: 0, transactions: [] },
            pagination: {
                currentPage: 1,
                totalPages: 0,
                totalTransactions: 0,
                hasNextPage: false,
                hasPrevPage: false
            },
            userName: req.session.userName || null,
            categories: await Category.find({ isListed: true }),
            error: 'Failed to load wallet information'
        });
    }
};


exports.processWalletRefund = async function(userId, amount, description) {
    try {
        console.log(`Processing wallet refund: User ${userId}, Amount: ₹${amount}, Description: ${description}`);

        // Find or create wallet for user
        let wallet = await Wallet.findOne({ userId });
        console.log(`Existing wallet found:`, wallet ? `Balance: ₹${wallet.balance}, Transactions: ${wallet.transactions.length}` : 'No wallet found');

        if (!wallet) {
            console.log('Creating new wallet for user');
            wallet = new Wallet({
                userId: userId,
                balance: 0,
                transactions: []
            });
        }

        // Store old balance for logging
        const oldBalance = wallet.balance;

        // Add refund amount to wallet balance
        wallet.balance += amount;

        // Add transaction record
        const transaction = {
            type: 'credit',
            amount: amount,
            description: description,
            date: new Date()
        };

        wallet.transactions.push(transaction);
        console.log(`Transaction added:`, transaction);
        console.log(`Balance updated: ₹${oldBalance} → ₹${wallet.balance}`);

        // Save wallet
        const savedWallet = await wallet.save();
        console.log(`Wallet saved successfully. New balance: ₹${savedWallet.balance}, Total transactions: ${savedWallet.transactions.length}`);

        console.log(`Wallet refund successful: ₹${amount} added to user ${userId} wallet`);
        return { success: true, newBalance: wallet.balance };
    } catch (error) {
        console.error('Error processing wallet refund:', error);
        throw error;
    }
};
