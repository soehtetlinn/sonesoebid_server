import express from 'express';
import dropshippingService from '../services/dropshipping.service.js';
import orderAutomationService from '../services/orderAutomation.service.js';
import productImportService from '../services/productImport.service.js';
import cjService from '../services/suppliers/cjdropshipping.service.js';
import aliexpressService from '../services/suppliers/aliexpress.service.js';

const router = express.Router();

// =============================================
// PUBLIC ROUTES (Customer)
// =============================================

/**
 * GET /api/dropship/products
 * Get all products with filters
 */
router.get('/products', async (req, res) => {
  try {
    const result = await dropshippingService.getProducts(req.query);
    res.json(result);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dropship/products/:id
 * Get single product by ID or slug
 */
router.get('/products/:id', async (req, res) => {
  try {
    const product = await dropshippingService.getProduct(req.params.id);
    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/dropship/categories
 * Get all product categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await dropshippingService.getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// CART ROUTES (Authenticated)
// =============================================

/**
 * GET /api/dropship/cart
 * Get user's cart
 */
router.get('/cart', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const cart = await dropshippingService.getCart(req.user.id);
    res.json(cart);
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/dropship/cart
 * Add item to cart
 */
router.post('/cart', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { productId, quantity } = req.body;
    const cartItem = await dropshippingService.addToCart(req.user.id, productId, quantity);
    res.json(cartItem);
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/dropship/cart/:productId
 * Update cart item quantity
 */
router.put('/cart/:productId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { quantity } = req.body;
    const cartItem = await dropshippingService.updateCartItem(req.user.id, req.params.productId, quantity);
    res.json(cartItem);
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/dropship/cart/:productId
 * Remove item from cart
 */
router.delete('/cart/:productId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    await dropshippingService.removeFromCart(req.user.id, req.params.productId);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/dropship/cart
 * Clear cart
 */
router.delete('/cart', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    await dropshippingService.clearCart(req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// ORDER ROUTES (Authenticated)
// =============================================

/**
 * POST /api/dropship/orders
 * Create order from cart
 */
router.post('/orders', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { shippingAddress, paymentDetails } = req.body;
    const orders = await dropshippingService.createOrder(req.user.id, shippingAddress, paymentDetails);
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/dropship/orders
 * Get user's orders
 */
router.get('/orders', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const result = await dropshippingService.getUserOrders(req.user.id, req.query);
    res.json(result);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dropship/orders/:id
 * Get single order
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const userId = req.user?.role?.includes('ADMIN') ? null : req.user?.id;
    const order = await dropshippingService.getOrder(req.params.id, userId);
    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(404).json({ error: error.message });
  }
});

// =============================================
// ADMIN ROUTES
// =============================================

/**
 * POST /api/dropship/admin/products
 * Create new product (Admin only)
 */
router.post('/admin/products', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const product = await dropshippingService.createProduct(req.body);
    res.json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/dropship/admin/products/:id
 * Update product (Admin only)
 */
router.put('/admin/products/:id', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const product = await dropshippingService.updateProduct(req.params.id, req.body);
    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/dropship/admin/products/:id
 * Delete product (Admin only)
 */
router.delete('/admin/products/:id', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    await dropshippingService.deleteProduct(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/dropship/admin/orders
 * Get all orders (Admin only)
 */
router.get('/admin/orders', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const result = await dropshippingService.getAllOrders(req.query);
    res.json(result);
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/dropship/admin/orders/:id/status
 * Update order status (Admin only)
 */
router.patch('/admin/orders/:id/status', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { status, note } = req.body;
    const order = await dropshippingService.updateOrderStatus(req.params.id, status, note);
    res.json(order);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PATCH /api/dropship/admin/orders/:id/tracking
 * Add tracking info (Admin only)
 */
router.patch('/admin/orders/:id/tracking', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { trackingNumber, trackingCarrier, trackingUrl } = req.body;
    const order = await dropshippingService.addTracking(
      req.params.id,
      trackingNumber,
      trackingCarrier,
      trackingUrl
    );
    res.json(order);
  } catch (error) {
    console.error('Add tracking error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/dropship/admin/dashboard
 * Get dashboard stats (Admin only)
 */
router.get('/admin/dashboard', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const stats = await dropshippingService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dropship/admin/suppliers
 * Get all suppliers (Admin only)
 */
router.get('/admin/suppliers', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const suppliers = await dropshippingService.getSuppliers();
    res.json(suppliers);
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/dropship/admin/suppliers
 * Create supplier (Admin only)
 */
router.post('/admin/suppliers', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const supplier = await dropshippingService.createSupplier(req.body);
    res.json(supplier);
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/dropship/admin/suppliers/:id
 * Update supplier (Admin only)
 */
router.put('/admin/suppliers/:id', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const supplier = await dropshippingService.updateSupplier(req.params.id, req.body);
    res.json(supplier);
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(400).json({ error: error.message });
  }
});

// =============================================
// ORDER AUTOMATION ROUTES (Admin)
// =============================================

/**
 * POST /api/dropship/admin/automation/process-order/:orderId
 * Manually trigger order processing (Admin only)
 */
router.post('/admin/automation/process-order/:orderId', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const result = await orderAutomationService.processOrder(req.params.orderId);
    res.json(result);
  } catch (error) {
    console.error('Process order error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/dropship/admin/automation/process-pending
 * Process all pending orders (Admin only)
 */
router.post('/admin/automation/process-pending', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const results = await orderAutomationService.processAllPendingOrders();
    res.json(results);
  } catch (error) {
    console.error('Process pending orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/dropship/admin/automation/update-tracking
 * Update tracking for all active orders (Admin only)
 */
router.post('/admin/automation/update-tracking', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const results = await orderAutomationService.updateAllTracking();
    res.json(results);
  } catch (error) {
    console.error('Update tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/dropship/admin/automation/update-tracking/:orderId
 * Update tracking for specific order (Admin only)
 */
router.post('/admin/automation/update-tracking/:orderId', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const result = await orderAutomationService.updateOrderTracking(req.params.orderId);
    res.json(result);
  } catch (error) {
    console.error('Update order tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// PRODUCT IMPORT ROUTES (Admin)
// =============================================

/**
 * POST /api/dropship/admin/import/cj
 * Import products from CJ Dropshipping (Admin only)
 * Body: { keyword: string, maxProducts: number }
 */
router.post('/admin/import/cj', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { keyword, maxProducts = 20 } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }
    
    const results = await productImportService.importFromCJ(keyword, maxProducts, req.user.id);
    res.json(results);
  } catch (error) {
    console.error('CJ import error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/dropship/admin/import/aliexpress
 * Import products from AliExpress (Admin only)
 * Body: { keyword: string, maxProducts: number }
 */
router.post('/admin/import/aliexpress', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { keyword, maxProducts = 20 } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }
    
    const results = await productImportService.importFromAliExpress(keyword, maxProducts, req.user.id);
    res.json(results);
  } catch (error) {
    console.error('AliExpress import error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/dropship/admin/import/recommended
 * Import recommended products (Admin only)
 * Body: { supplierType: string, maxProducts: number }
 */
router.post('/admin/import/recommended', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { supplierType = 'CJ_DROPSHIPPING', maxProducts = 20 } = req.body;
    const results = await productImportService.importRecommended(supplierType, maxProducts, req.user.id);
    res.json(results);
  } catch (error) {
    console.error('Recommended import error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/dropship/admin/import/sync
 * Sync existing products with suppliers (update prices) (Admin only)
 * Body: { supplierId?: string }
 */
router.post('/admin/import/sync', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { supplierId } = req.body;
    const results = await productImportService.syncProducts(supplierId);
    res.json(results);
  } catch (error) {
    console.error('Sync products error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dropship/admin/import/history
 * Get import history (Admin only)
 */
router.get('/admin/import/history', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const limit = parseInt(req.query.limit) || 10;
    const history = await productImportService.getImportHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('Get import history error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dropship/admin/suppliers/health
 * Check supplier API health (Admin only)
 */
router.get('/admin/suppliers/health', async (req, res) => {
  try {
    if (!req.user || !req.user.role || !['ADMIN', 'MODERATOR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const [cjHealth, aeHealth] = await Promise.all([
      cjService.healthCheck(),
      aliexpressService.healthCheck()
    ]);
    
    res.json({
      cjDropshipping: cjHealth,
      aliexpress: aeHealth
    });
  } catch (error) {
    console.error('Supplier health check error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

