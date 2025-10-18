const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/admin.controller');
const { checkAdminSession, preventBackAfterLogout } = require('../middlewares/auth.middleware'); 
const multer = require("multer");
const path = require("path");

//   Multer config for product image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../public/uploads/product-images/");
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Optional: Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPG, PNG, and JPEG are allowed."));
    }
  }
});

//   Public Routes (No login required)
router.get('/adminLogin', adminController.getAdminLogin);
router.post('/adminLogin',adminController.handleAdminLogin);

//   Middleware applied to all routes below
router.use(checkAdminSession);
router.use(preventBackAfterLogout); 

//   Admin Home & User Management
router.get('/adminHome', adminController.getAdminHome);
router.get('/userManagement', adminController.getAdminUserManagement);
router.get('/blockUser/:id', adminController.blockUser);
router.get('/unblockUser/:id', adminController.unblockUser);
router.get('/toggleBlock/:id', adminController.toggleBlockUser);

//   Category Management
router.get('/categoryManagement', adminController.getCategoryManagementPage);
router.get("/category", adminController.categoryInfo);
router.post("/addCategory", adminController.addCategory);
router.get("/listCategory", adminController.getListCategory);
router.get("/unlistCategory", adminController.getUnlistCategory);
router.get("/editCategory", adminController.getEditCategory);
router.post("/editCategory/:id", adminController.editCategory);
router.post("/delete-category/:id", adminController.deleteCategory);

//   Subcategory Management
router.get('/subcategories', adminController.listSubcategories); // optional ?category=
router.post('/addSubcategory', adminController.addSubcategory);
router.post('/editSubcategory/:id', adminController.editSubcategory);
router.patch('/toggle-subcategory/:id', adminController.toggleSubcategory);
router.delete('/delete-subcategory/:id', adminController.deleteSubcategory);

//   Product Management

router.get('/products', adminController.getProductList);
router.post('/add-products', upload.any(), adminController.addProducts);
router.post('/edit-product/:id', upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 }
]), adminController.editProduct);
router.post('/toggle-block-product/:id', adminController.toggleBlockProduct);


//   Order Management
router.get('/orders', adminController.getOrderManagement);
router.get('/orders/:id', adminController.getOrderDetail);
router.post('/orders/:id/items/:itemId/status', adminController.changeItemStatus);
router.post('/orders/:id/items/:itemId/verify-return', adminController.verifyItemReturnRequest);
router.post('/orders/:id/status', adminController.changeOrderStatus);
router.post('/orders/:id/verify-return', adminController.verifyReturnRequest);

//   Inventory Management
router.get('/inventory', adminController.getInventoryManagement);
router.post('/inventory/update-stock/:productId', adminController.updateStock);
router.post('/inventory/bulk-update', adminController.bulkUpdateStock);

// Custom Product Management

router.get('/custom-products',adminController.getCustomProductList);

// Coupon Management Routes (renamed from offers)
const couponController = require('../controllers/admin/coupon.controller');
router.get('/couponManagement', couponController.getCouponManagement);
router.post('/add-coupon', couponController.addCoupon);
router.get('/coupon/:id', couponController.getCouponDetails);
router.put('/coupon/:id', couponController.updateCoupon);
router.delete('/coupon/:id', couponController.deleteCoupon);
router.patch('/coupon/:id/toggle-status', couponController.toggleCouponStatus);

// New Offer Management Routes
const offerController = require('../controllers/admin/offer.controller');
const categoryOfferController = require('../controllers/categoryOfferController');
router.get('/offerManagement', offerController.getOfferManagement);

// Product Offer Routes
router.post('/add-product-offer', offerController.addProductOffer);
router.get('/product-offer/:id', offerController.getProductOfferDetails);
router.put('/product-offer/:id', offerController.updateProductOffer);
router.delete('/product-offer/:id', offerController.deleteProductOffer);
router.patch('/product-offer/:id/toggle-status', offerController.toggleProductOfferStatus);

// Category Offer Routes
router.post('/add-category-offer', categoryOfferController.addCategoryOffer);
router.get('/category-offer/:id', categoryOfferController.getCategoryOfferDetails);
router.put('/category-offer/:id', categoryOfferController.updateCategoryOffer);
router.delete('/category-offer/:id', categoryOfferController.deleteCategoryOffer);
router.patch('/category-offer/:id/toggle-status', categoryOfferController.toggleCategoryOfferStatus);

// Referral Offer Routes
// router.post('/add-referral-offer', offerController.addReferralOffer);
// router.get('/referral-offer/:id', offerController.getReferralOfferDetails);
// router.put('/referral-offer/:id', offerController.updateReferralOffer);
// router.delete('/referral-offer/:id', offerController.deleteReferralOffer);
// router.patch('/referral-offer/:id/toggle-status', offerController.toggleReferralOfferStatus);

// Sales Report Routes
const salesReportController = require('../controllers/admin/salesReport.controller');
router.get('/sales-report', salesReportController.getSalesReport);
router.get('/sales-report-data', salesReportController.getSalesDataAPI);
router.get('/sales-report-pdf', salesReportController.downloadSalesReportPDF);
router.get('/sales-report-excel', salesReportController.downloadSalesReportExcel);

//sample route

router.get('/sample',adminController.sampleView)

//   Admin Logout
router.post('/adminLogout',preventBackAfterLogout ,adminController.handleLogout);

module.exports = router;
