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

//   Product Management

router.get('/products', adminController.getProductList);
router.post('/add-products', upload.array('productImage', 4), adminController.addProducts);
router.post('/edit-product/:id', upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 }
]), adminController.editProduct);
router.post('/delete-product/:id', adminController.deleteProduct);
router.post('/toggle-block-product/:id', adminController.toggleBlockProduct);


//   Order Management
router.get('/orders', adminController.getOrderManagement);
router.get('/orders/:id', adminController.getOrderDetail);
router.post('/orders/:id/status', adminController.changeOrderStatus);
router.post('/orders/:id/verify-return', adminController.verifyReturnRequest);

// Custom Product Management

router.get('/custom-products',adminController.getCustomProductList);

//   Offers (assumed routes)
router.post("/add-product-offer/:id", adminController.addProducts); 
router.post("/delete-product-offer/:id", adminController.deleteProduct);
router.post("/add-category-offer/:id", adminController.addCategory); 

//   Admin Logout
router.post('/adminLogout',preventBackAfterLogout ,adminController.handleLogout);

module.exports = router;
