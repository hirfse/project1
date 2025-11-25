const express = require('express');
const router = express.Router();
// const adminController = require('../controllers/admin/admin.controller');
const {getAdminLogin, handleAdminLogin, getSalesData, getAdminHome, handleLogout } = require('../controllers/admin/adminAuth.controller');
const {getAdminUserManagement, blockUser, unblockUser, toggleBlockUser} = require('../controllers/admin/user.controller');
const {getProductList, addProducts, editProduct, toggleBlockProduct} = require('../controllers/admin/product.controller');
const {getCategoryManagementPage, categoryInfo, addCategory, getListCategory, getUnlistCategory, getEditCategory, editCategory, deleteCategory , listSubcategories, addSubcategory, editSubcategory, toggleSubcategory, deleteSubcategory} = require('../controllers/admin/category.controller');
const {getOrderManagement, getOrderDetail, changeItemStatus, verifyItemReturnRequest, changeOrderStatus, verifyReturnRequest} = require('../controllers/admin/order.controller');
const {getInventoryManagement, updateStock, bulkUpdateStock} = require('../controllers/admin/inventory.controller');


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
router.get('/adminLogin', getAdminLogin);
router.post('/adminLogin',handleAdminLogin);

//   Middleware applied to all routes below
router.use(checkAdminSession);
router.use(preventBackAfterLogout); 

// Sales Data API
router.get('/api/sales-data', getSalesData);

//   Admin Home & User Management
router.get('/adminHome', getAdminHome);
router.get('/userManagement', getAdminUserManagement);
router.get('/blockUser/:id', blockUser);
router.get('/unblockUser/:id', unblockUser);
router.get('/toggleBlock/:id', toggleBlockUser);

//   Category Management
router.get('/categoryManagement', getCategoryManagementPage);
router.get("/category", categoryInfo);
router.post("/addCategory", addCategory);
router.get("/listCategory", getListCategory);
router.get("/unlistCategory", getUnlistCategory);
router.get("/editCategory", getEditCategory);
router.post("/editCategory/:id", editCategory);
router.post("/delete-category/:id", deleteCategory);

//   Subcategory Management
router.get('/subcategories', listSubcategories); // optional ?category=
router.post('/addSubcategory', addSubcategory);
router.post('/editSubcategory/:id', editSubcategory);
router.patch('/toggle-subcategory/:id', toggleSubcategory);
router.delete('/delete-subcategory/:id', deleteSubcategory);

//   Product Management

router.get('/products', getProductList);
router.post('/add-products', upload.any(), addProducts);
router.post('/edit-product/:id', upload.any(), editProduct);
router.post('/toggle-block-product/:id', toggleBlockProduct);


//   Order Management
router.get('/orders', getOrderManagement);
router.get('/orders/:id', getOrderDetail);
router.post('/orders/:id/items/:itemId/status', changeItemStatus);
router.post('/orders/:id/items/:itemId/verify-return', verifyItemReturnRequest);
router.post('/orders/:id/status', changeOrderStatus);
router.post('/orders/:id/verify-return', verifyReturnRequest);

//   Inventory Management
router.get('/inventory', getInventoryManagement);
router.post('/inventory/update-stock/:productId', updateStock);
router.post('/inventory/bulk-update', bulkUpdateStock);

// Custom Product Management

// router.get('/custom-products',adminController.getCustomProductList);

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
router.post('/add-referral-offer', offerController.addReferralOffer);
router.get('/referral-offer/:id', offerController.getReferralOfferDetails);
router.put('/referral-offer/:id', offerController.updateReferralOffer);
router.delete('/referral-offer/:id', offerController.deleteReferralOffer);
router.patch('/referral-offer/:id/toggle-status', offerController.toggleReferralOfferStatus);

// Sales Report Routes
const salesReportController = require('../controllers/admin/salesReport.controller');
router.get('/sales-report', salesReportController.getSalesReport);
router.get('/sales-report-data', salesReportController.getSalesDataAPI);
router.get('/sales-report-pdf', salesReportController.downloadSalesReportPDF);
router.get('/sales-report-excel', salesReportController.downloadSalesReportExcel);



//   Admin Logout
router.post('/adminLogout',preventBackAfterLogout ,handleLogout);

module.exports = router;
