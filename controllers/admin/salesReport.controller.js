const Order = require('../../models/order.model');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Get Sales Report Page
exports.getSalesReport = async (req, res) => {
    try {
        const { reportType = 'daily', startDate, endDate } = req.query;
        
        // Calculate date range based on report type
        const dateRange = getDateRange(reportType, startDate, endDate);
        
        // Get sales data
        const salesData = await getSalesData(dateRange.start, dateRange.end);
        
        // Get additional analytics
        const analytics = await getSalesAnalytics(dateRange.start, dateRange.end);
        
        res.render('admin/salesReport', {
            salesData,
            analytics,
            reportType,
            dateRange,
            startDate: startDate || '',
            endDate: endDate || ''
        });
    } catch (error) {
        console.error('Error fetching sales report:', error);
        res.status(500).render('admin/salesReport', {
            salesData: {
                orders: [],
                totalSales: 0,
                totalOrders: 0,
                totalDiscount: 0,
                totalOfferDiscount: 0
            },
            analytics: {},
            reportType: 'daily',
            dateRange: {},
            startDate: '',
            endDate: '',
            error: 'Failed to load sales report'
        });
    }
};

// Get Sales Data for API (AJAX)
exports.getSalesDataAPI = async (req, res) => {
    try {
        const { reportType = 'daily', startDate, endDate } = req.query;
        
        const dateRange = getDateRange(reportType, startDate, endDate);
        const salesData = await getSalesData(dateRange.start, dateRange.end);
        const analytics = await getSalesAnalytics(dateRange.start, dateRange.end);
        
        res.json({
            success: true,
            salesData,
            analytics,
            dateRange
        });
    } catch (error) {
        console.error('Error fetching sales data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sales data'
        });
    }
};

// Download Sales Report as PDF
exports.downloadSalesReportPDF = async (req, res) => {
    try {
        const { reportType = 'daily', startDate, endDate } = req.query;
        
        const dateRange = getDateRange(reportType, startDate, endDate);
        const salesData = await getSalesData(dateRange.start, dateRange.end);
        
        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${reportType}-${Date.now()}.pdf`);
        
        // Pipe PDF to response
        doc.pipe(res);
        
        // Add content to PDF
        generatePDFContent(doc, salesData, reportType, dateRange);
        
        // Finalize PDF
        doc.end();
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
};

// Download Sales Report as Excel
exports.downloadSalesReportExcel = async (req, res) => {
    try {
        const { reportType = 'daily', startDate, endDate } = req.query;
        
        const dateRange = getDateRange(reportType, startDate, endDate);
        const salesData = await getSalesData(dateRange.start, dateRange.end);
        
        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');
        
        // Add headers
        worksheet.columns = [
            { header: 'Order ID', key: 'orderID', width: 15 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Customer', key: 'customer', width: 20 },
            { header: 'Products', key: 'products', width: 30 },
            { header: 'Payment Method', key: 'paymentMethod', width: 15 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Subtotal', key: 'subtotal', width: 12 },
            { header: 'Discount', key: 'discount', width: 12 },
            { header: 'Offer Discount', key: 'offerDiscount', width: 15 },
            { header: 'Total', key: 'total', width: 12 }
        ];
        
        // Add data rows
        salesData.orders.forEach(order => {
            worksheet.addRow({
                orderID: order.orderID,
                date: new Date(order.orderDate).toLocaleDateString(),
                customer: order.userId ? order.userId.fullName : 'N/A',
                products: order.items.map(item => `${item.productName} (${item.quantity})`).join(', '),
                paymentMethod: order.paymentMethod,
                status: order.status,
                subtotal: order.subtotal,
                discount: order.discount,
                offerDiscount: order.offerDiscount,
                total: order.total
            });
        });
        
        // Add summary row
        worksheet.addRow({});
        worksheet.addRow({
            orderID: 'TOTAL',
            subtotal: salesData.totalSales,
            discount: salesData.totalDiscount,
            offerDiscount: salesData.totalOfferDiscount,
            total: salesData.totalSales
        });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${reportType}-${Date.now()}.xlsx`);
        
        // Send Excel file
        await workbook.xlsx.write(res);
        res.end();
        
    } catch (error) {
        console.error('Error generating Excel:', error);
        res.status(500).json({ success: false, message: 'Failed to generate Excel file' });
    }
};

// Helper function to get date range based on report type
function getDateRange(reportType, startDate, endDate) {
    const now = new Date();
    let start, end;
    
    switch (reportType) {
        case 'daily':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            break;
            
        case 'weekly': {
            const dayOfWeek = now.getDay();
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 7);
            break;
        }
            
        case 'monthly':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            break;
            
        case 'yearly':
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear() + 1, 0, 1);
            break;
            
        case 'custom':
            if (startDate && endDate) {
                start = new Date(startDate);
                end = new Date(endDate);
                end.setDate(end.getDate() + 1); // Include end date
            } else {
                // Default to current month if no dates provided
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            }
            break;
            
        default:
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    }
    
    return { start, end };
}

// Helper function to get sales data
async function getSalesData(startDate, endDate) {
    try {
        // Get orders within date range (only delivered orders for sales)
        const orders = await Order.find({
            orderDate: { $gte: startDate, $lt: endDate },
            status: { $in: ['Delivered', 'Shipped', 'Out for Delivery', 'Confirmed'] }
        })
        .populate('userId', 'fullName email')
        .sort({ orderDate: -1 })
        .lean();
        
        // Calculate totals
        const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
        const totalOrders = orders.length;
        const totalDiscount = orders.reduce((sum, order) => sum + (order.discount || 0), 0);
        const totalOfferDiscount = orders.reduce((sum, order) => sum + (order.offerDiscount || 0), 0);
        
        return {
            orders,
            totalSales,
            totalOrders,
            totalDiscount,
            totalOfferDiscount
        };
    } catch (error) {
        console.error('Error fetching sales data:', error);
        return {
            orders: [],
            totalSales: 0,
            totalOrders: 0,
            totalDiscount: 0,
            totalOfferDiscount: 0
        };
    }
}

// Helper function to get sales analytics
async function getSalesAnalytics(startDate, endDate) {
    try {
        // Get top selling products
        const topProducts = await Order.aggregate([
            { $match: { 
                orderDate: { $gte: startDate, $lt: endDate },
                status: { $in: ['Delivered', 'Shipped', 'Out for Delivery', 'Confirmed'] }
            }},
            { $unwind: '$items' },
            { $group: {
                _id: '$items.productId',
                productName: { $first: '$items.productName' },
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
            }},
            { $sort: { totalQuantity: -1 } },
            { $limit: 5 }
        ]);
        
        // Get sales by payment method
        const paymentMethods = await Order.aggregate([
            { $match: { 
                orderDate: { $gte: startDate, $lt: endDate },
                status: { $in: ['Delivered', 'Shipped', 'Out for Delivery', 'Confirmed'] }
            }},
            { $group: {
                _id: '$paymentMethod',
                count: { $sum: 1 },
                totalAmount: { $sum: '$total' }
            }}
        ]);
        
        // Get daily sales trend (for charts)
        const dailySales = await Order.aggregate([
            { $match: { 
                orderDate: { $gte: startDate, $lt: endDate },
                status: { $in: ['Delivered', 'Shipped', 'Out for Delivery', 'Confirmed'] }
            }},
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$orderDate' } },
                totalSales: { $sum: '$total' },
                orderCount: { $sum: 1 }
            }},
            { $sort: { '_id': 1 } }
        ]);
        
        return {
            topProducts,
            paymentMethods,
            dailySales
        };
    } catch (error) {
        console.error('Error fetching sales analytics:', error);
        return {
            topProducts: [],
            paymentMethods: [],
            dailySales: []
        };
    }
}

// Helper function to generate PDF content
function generatePDFContent(doc, salesData, reportType, dateRange) {
    // Add title
    doc.fontSize(20).text('Sales Report', 50, 50);
    doc.fontSize(12).text(`Report Type: ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`, 50, 80);
    doc.text(`Period: ${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`, 50, 95);
    
    // Add summary
    doc.text(`Total Orders: ${salesData.totalOrders}`, 50, 120);
    doc.text(`Total Sales: ₹${salesData.totalSales.toFixed(2)}`, 50, 135);
    doc.text(`Total Discount: ₹${salesData.totalDiscount.toFixed(2)}`, 50, 150);
    doc.text(`Total Offer Discount: ₹${salesData.totalOfferDiscount.toFixed(2)}`, 50, 165);
    
    // Add orders table
    let yPosition = 200;
    doc.fontSize(14).text('Orders Details', 50, yPosition);
    yPosition += 20;
    
    // Table headers
    doc.fontSize(10);
    doc.text('Order ID', 50, yPosition);
    doc.text('Date', 120, yPosition);
    doc.text('Customer', 180, yPosition);
    doc.text('Status', 280, yPosition);
    doc.text('Total', 350, yPosition);
    yPosition += 15;
    
    // Table rows
    salesData.orders.forEach(order => {
        if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
        }
        
        doc.text(order.orderID, 50, yPosition);
        doc.text(new Date(order.orderDate).toLocaleDateString(), 120, yPosition);
        doc.text(order.userId ? order.userId.fullName : 'N/A', 180, yPosition);
        doc.text(order.status, 280, yPosition);
        doc.text(`₹${order.total.toFixed(2)}`, 350, yPosition);
        yPosition += 15;
    });
}

module.exports = {
    getSalesReport: exports.getSalesReport,
    getSalesDataAPI: exports.getSalesDataAPI,
    downloadSalesReportPDF: exports.downloadSalesReportPDF,
    downloadSalesReportExcel: exports.downloadSalesReportExcel
};
