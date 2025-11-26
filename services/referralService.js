const Order = require('../models/order.model');
const User = require('../models/user.model');
const Wallet = require('../models/wallet.model');
const ReferralOffer = require('../models/referralOffer.model');

// Apply referral rewards for the referee's first eligible order
async function applyReferralRewards(order) {
  try {
    if (!order || !order.userId) return;
    const user = await User.findById(order.userId);
    if (!user || !user.referredBy) return; // No referral associated

    // Ensure there is an active referral offer
    const now = new Date();
    const offer = await ReferralOffer.findOne({
      isActive: true,
      isBlocked: false,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });
    if (!offer) return;

    // Check min purchase amount
    const orderTotal = order.total || 0;
    if (orderTotal < (offer.minPurchaseAmount || 0)) return;

    // Ensure this is the first eligible order for the referee
    const priorOrders = await Order.countDocuments({ userId: order.userId, _id: { $ne: order._id } });
    if (priorOrders > 0) return;

    // Check referrer limit
    const referrer = await User.findById(user.referredBy);
    if (!referrer) return;
    if (typeof offer.maxReferralsPerUser === 'number' && offer.maxReferralsPerUser >= 0) {
      if ((referrer.referralCount || 0) >= offer.maxReferralsPerUser) return;
    }

    // Helper to compute reward amount/points
    const computeReward = (type, value, maxCap, base) => {
      if (type === 'percentage') {
        const amt = (base * value) / 100;
        return Math.min(amt, maxCap || amt);
      } else if (type === 'amount') {
        return value;
      } else if (type === 'points') {
        return Math.max(0, Math.floor(value));
      }
      return 0;
    };

    // Calculate rewards
    const referrerType = offer.referrerRewardType;
    const referrerValue = offer.referrerRewardValue;
    const referrerMax = offer.referrerRewardType === 'percentage' ? offer.referrerMaxReward : undefined;
    const refereeType = offer.refereeRewardType;
    const refereeValue = offer.refereeRewardValue;
    const refereeMax = offer.refereeRewardType === 'percentage' ? offer.refereeMaxReward : undefined;

    const referrerReward = computeReward(referrerType, referrerValue, referrerMax, orderTotal);
    const refereeReward = computeReward(refereeType, refereeValue, refereeMax, orderTotal);

    // Credit referrer
    if (referrerType === 'points') {
      referrer.points = (referrer.points || 0) + referrerReward;
    } else {
      let refWallet = await Wallet.findOne({ userId: referrer._id });
      if (!refWallet) refWallet = new Wallet({ userId: referrer._id, balance: 0, transactions: [] });
      refWallet.balance += referrerReward;
      refWallet.transactions.push({
        type: 'credit',
        amount: referrerReward,
        description: `Referral reward (referrer) for order ${order.orderID}`,
        orderId: order._id
      });
      await refWallet.save();
    }

    // Credit referee
    if (refereeType === 'points') {
      user.points = (user.points || 0) + refereeReward;
    } else {
      let refWallet2 = await Wallet.findOne({ userId: user._id });
      if (!refWallet2) refWallet2 = new Wallet({ userId: user._id, balance: 0, transactions: [] });
      refWallet2.balance += refereeReward;
      refWallet2.transactions.push({
        type: 'credit',
        amount: refereeReward,
        description: `Referral reward (referee) for order ${order.orderID}`,
        orderId: order._id
      });
      await refWallet2.save();
    }

    // Update counts and tracking
    referrer.referralCount = (referrer.referralCount || 0) + 1;
    await referrer.save();
    await user.save();

    offer.totalReferrals = (offer.totalReferrals || 0) + 1;
    const paid = (referrerType === 'points' ? 0 : referrerReward) + (refereeType === 'points' ? 0 : refereeReward);
    offer.totalRewardsPaid = (offer.totalRewardsPaid || 0) + paid;
    offer.updatedAt = new Date();
    await offer.save();
  } catch (err) {
    console.error('applyReferralRewards error:', err);
  }
}

module.exports = { applyReferralRewards };
