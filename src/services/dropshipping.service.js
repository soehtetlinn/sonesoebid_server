import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Dropshipping Service
 * Handles all business logic for dropshipping operations
 */
class DropshippingService {
  
  // =============================================
  // PRODUCT MANAGEMENT
  // =============================================
  
  /**
   * Get all active dropship products with pagination and filters
   */
  async getProducts({ page = 1, limit = 20, category, search, minPrice, maxPrice, sortBy = 'createdAt', sortOrder = 'desc' }) {
    const skip = (page - 1) * limit;
    
    const where = {
      isActive: true,
      status: 'ACTIVE',
      ...(category && { category }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { tags: { has: search } }
        ]
      }),
      ...(minPrice || maxPrice ? {
        sellingPrice: {
          ...(minPrice && { gte: parseFloat(minPrice) }),
          ...(maxPrice && { lte: parseFloat(maxPrice) })
        }
      } : {})
    };
    
    const [products, total] = await Promise.all([
      prisma.dropshipProduct.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              type: true,
              avgShippingDays: true
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { [sortBy]: sortOrder }
      }),
      prisma.dropshipProduct.count({ where })
    ]);
    
    return {
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  /**
   * Get single product by ID or slug
   */
  async getProduct(identifier) {
    const product = await prisma.dropshipProduct.findFirst({
      where: {
        OR: [
          { id: identifier },
          { slug: identifier }
        ],
        isActive: true
      },
      include: {
        supplier: true
      }
    });
    
    if (!product) {
      throw new Error('Product not found');
    }
    
    // Increment view count
    await prisma.dropshipProduct.update({
      where: { id: product.id },
      data: { viewCount: { increment: 1 } }
    });
    
    return product;
  }
  
  /**
   * Create new dropship product
   */
  async createProduct(data) {
    // Calculate profit
    const profitAmount = data.sellingPrice - data.supplierCost;
    const profitMargin = (profitAmount / data.sellingPrice) * 100;
    
    // Generate slug
    const slug = this.generateSlug(data.title);
    
    const product = await prisma.dropshipProduct.create({
      data: {
        ...data,
        slug,
        profitAmount,
        profitMargin,
        images: data.images || [],
        tags: data.tags || [],
        lastSyncedAt: new Date()
      },
      include: {
        supplier: true
      }
    });
    
    return product;
  }
  
  /**
   * Update product
   */
  async updateProduct(id, data) {
    // Recalculate profit if prices changed
    if (data.sellingPrice || data.supplierCost) {
      const existing = await prisma.dropshipProduct.findUnique({ where: { id } });
      const sellingPrice = data.sellingPrice || existing.sellingPrice;
      const supplierCost = data.supplierCost || existing.supplierCost;
      
      data.profitAmount = sellingPrice - supplierCost;
      data.profitMargin = (data.profitAmount / sellingPrice) * 100;
    }
    
    const product = await prisma.dropshipProduct.update({
      where: { id },
      data,
      include: {
        supplier: true
      }
    });
    
    return product;
  }
  
  /**
   * Delete product (soft delete)
   */
  async deleteProduct(id) {
    return await prisma.dropshipProduct.update({
      where: { id },
      data: { isActive: false }
    });
  }
  
  /**
   * Get product categories
   */
  async getCategories() {
    const products = await prisma.dropshipProduct.findMany({
      where: { isActive: true },
      select: { category: true }
    });
    
    const categories = [...new Set(products.map(p => p.category))];
    return categories.filter(Boolean);
  }
  
  // =============================================
  // CART MANAGEMENT
  // =============================================
  
  /**
   * Get user's cart
   */
  async getCart(userId) {
    const cartItems = await prisma.dropshipCartItem.findMany({
      where: { userId: parseInt(userId) },
      include: {
        product: {
          include: {
            supplier: {
              select: {
                name: true,
                avgShippingDays: true
              }
            }
          }
        }
      }
    });
    
    // Calculate totals
    const subtotal = cartItems.reduce((sum, item) => 
      sum + (item.product.sellingPrice * item.quantity), 0
    );
    const shipping = cartItems.reduce((sum, item) => 
      sum + item.product.shippingCost, 0
    );
    const total = subtotal + shipping;
    
    return {
      items: cartItems,
      summary: {
        itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
        subtotal,
        shipping,
        total
      }
    };
  }
  
  /**
   * Add item to cart
   */
  async addToCart(userId, productId, quantity = 1) {
    // Check if product exists and is available
    const product = await prisma.dropshipProduct.findUnique({
      where: { id: productId }
    });
    
    if (!product || !product.isActive || product.status !== 'ACTIVE') {
      throw new Error('Product not available');
    }
    
    // Check stock
    if (product.stockQuantity < quantity) {
      throw new Error('Insufficient stock');
    }
    
    // Check if already in cart
    const existing = await prisma.dropshipCartItem.findUnique({
      where: {
        userId_productId: {
          userId: parseInt(userId),
          productId
        }
      }
    });
    
    if (existing) {
      // Update quantity
      return await prisma.dropshipCartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
        include: { product: true }
      });
    } else {
      // Create new cart item
      return await prisma.dropshipCartItem.create({
        data: {
          userId: parseInt(userId),
          productId,
          quantity
        },
        include: { product: true }
      });
    }
  }
  
  /**
   * Update cart item quantity
   */
  async updateCartItem(userId, productId, quantity) {
    if (quantity <= 0) {
      // Remove item
      return await this.removeFromCart(userId, productId);
    }
    
    const product = await prisma.dropshipProduct.findUnique({
      where: { id: productId }
    });
    
    if (product.stockQuantity < quantity) {
      throw new Error('Insufficient stock');
    }
    
    return await prisma.dropshipCartItem.update({
      where: {
        userId_productId: {
          userId: parseInt(userId),
          productId
        }
      },
      data: { quantity },
      include: { product: true }
    });
  }
  
  /**
   * Remove item from cart
   */
  async removeFromCart(userId, productId) {
    return await prisma.dropshipCartItem.delete({
      where: {
        userId_productId: {
          userId: parseInt(userId),
          productId
        }
      }
    });
  }
  
  /**
   * Clear user's cart
   */
  async clearCart(userId) {
    return await prisma.dropshipCartItem.deleteMany({
      where: { userId: parseInt(userId) }
    });
  }
  
  // =============================================
  // ORDER MANAGEMENT
  // =============================================
  
  /**
   * Create order from cart
   */
  async createOrder(userId, shippingAddress, paymentDetails) {
    const cart = await this.getCart(userId);
    
    if (cart.items.length === 0) {
      throw new Error('Cart is empty');
    }
    
    const orders = [];
    
    // Create order for each item (in real app, you might batch by supplier)
    for (const item of cart.items) {
      const orderNumber = this.generateOrderNumber();
      
      const order = await prisma.dropshipOrder.create({
        data: {
          orderNumber,
          customerId: parseInt(userId),
          customerEmail: shippingAddress.email,
          customerPhone: shippingAddress.phone,
          productId: item.productId,
          productTitle: item.product.title,
          productImage: item.product.images[0] || null,
          quantity: item.quantity,
          supplierId: item.product.supplierId,
          shippingFirstName: shippingAddress.firstName,
          shippingLastName: shippingAddress.lastName,
          shippingAddress1: shippingAddress.address1,
          shippingAddress2: shippingAddress.address2,
          shippingCity: shippingAddress.city,
          shippingState: shippingAddress.state,
          shippingZip: shippingAddress.zip,
          shippingCountry: shippingAddress.country,
          shippingPhone: shippingAddress.phone,
          productPrice: item.product.sellingPrice * item.quantity,
          shippingFee: item.product.shippingCost,
          tax: 0,
          discount: 0,
          totalPaid: (item.product.sellingPrice * item.quantity) + item.product.shippingCost,
          supplierCost: item.product.supplierCost * item.quantity,
          profit: (item.product.sellingPrice - item.product.supplierCost) * item.quantity,
          paymentMethod: paymentDetails.method,
          paymentTransactionId: paymentDetails.transactionId,
          statusHistory: [
            {
              status: 'PENDING',
              timestamp: new Date().toISOString(),
              note: 'Order created'
            }
          ]
        },
        include: {
          product: true,
          supplier: true
        }
      });
      
      // Update product order count
      await prisma.dropshipProduct.update({
        where: { id: item.productId },
        data: { orderCount: { increment: item.quantity } }
      });
      
      orders.push(order);
    }
    
    // Clear cart
    await this.clearCart(userId);
    
    // In a real app, trigger automation to send orders to suppliers
    // For now, just mark as pending
    
    return orders;
  }
  
  /**
   * Get user's orders
   */
  async getUserOrders(userId, { page = 1, limit = 10, status }) {
    const skip = (page - 1) * limit;
    
    const where = {
      customerId: parseInt(userId),
      ...(status && { status })
    };
    
    const [orders, total] = await Promise.all([
      prisma.dropshipOrder.findMany({
        where,
        include: {
          product: true,
          supplier: {
            select: {
              name: true,
              type: true
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { orderDate: 'desc' }
      }),
      prisma.dropshipOrder.count({ where })
    ]);
    
    return {
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  /**
   * Get single order
   */
  async getOrder(orderId, userId) {
    const order = await prisma.dropshipOrder.findUnique({
      where: { id: orderId },
      include: {
        product: true,
        supplier: true,
        customer: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    // If user is not admin, check ownership
    if (userId && order.customerId !== parseInt(userId)) {
      throw new Error('Unauthorized');
    }
    
    return order;
  }
  
  /**
   * Update order status
   */
  async updateOrderStatus(orderId, status, note = '') {
    const order = await prisma.dropshipOrder.findUnique({
      where: { id: orderId }
    });
    
    const statusHistory = [
      ...order.statusHistory,
      {
        status,
        timestamp: new Date().toISOString(),
        note
      }
    ];
    
    const updateData = {
      status,
      statusHistory,
      ...(status === 'SHIPPED' && { shippedAt: new Date() }),
      ...(status === 'DELIVERED' && { deliveredAt: new Date() }),
      ...(status === 'CANCELLED' && { cancelledAt: new Date() }),
      ...(status === 'REFUNDED' && { refundedAt: new Date() })
    };
    
    return await prisma.dropshipOrder.update({
      where: { id: orderId },
      data: updateData,
      include: {
        product: true,
        supplier: true
      }
    });
  }
  
  /**
   * Add tracking info to order
   */
  async addTracking(orderId, trackingNumber, trackingCarrier, trackingUrl) {
    return await prisma.dropshipOrder.update({
      where: { id: orderId },
      data: {
        trackingNumber,
        trackingCarrier,
        trackingUrl,
        status: 'SHIPPED',
        shippedAt: new Date()
      }
    });
  }
  
  // =============================================
  // SUPPLIER MANAGEMENT
  // =============================================
  
  /**
   * Get all suppliers
   */
  async getSuppliers() {
    return await prisma.dropshipSupplier.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            products: true,
            orders: true
          }
        }
      }
    });
  }
  
  /**
   * Create supplier
   */
  async createSupplier(data) {
    return await prisma.dropshipSupplier.create({
      data
    });
  }
  
  /**
   * Update supplier
   */
  async updateSupplier(id, data) {
    return await prisma.dropshipSupplier.update({
      where: { id },
      data
    });
  }
  
  // =============================================
  // ADMIN / ANALYTICS
  // =============================================
  
  /**
   * Get dashboard stats
   */
  async getDashboardStats() {
    const [
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      totalRevenue,
      totalProfit
    ] = await Promise.all([
      prisma.dropshipProduct.count(),
      prisma.dropshipProduct.count({ where: { status: 'ACTIVE' } }),
      prisma.dropshipOrder.count(),
      prisma.dropshipOrder.count({ where: { status: 'PENDING' } }),
      prisma.dropshipOrder.aggregate({
        _sum: { totalPaid: true }
      }),
      prisma.dropshipOrder.aggregate({
        _sum: { profit: true }
      })
    ]);
    
    // Get recent orders
    const recentOrders = await prisma.dropshipOrder.findMany({
      take: 10,
      orderBy: { orderDate: 'desc' },
      include: {
        product: {
          select: {
            title: true,
            images: true
          }
        },
        customer: {
          select: {
            username: true,
            email: true
          }
        }
      }
    });
    
    // Get top selling products
    const topProducts = await prisma.dropshipProduct.findMany({
      where: { isActive: true },
      orderBy: { orderCount: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        images: true,
        sellingPrice: true,
        orderCount: true,
        profitAmount: true
      }
    });
    
    return {
      stats: {
        totalProducts,
        activeProducts,
        totalOrders,
        pendingOrders,
        totalRevenue: totalRevenue._sum.totalPaid || 0,
        totalProfit: totalProfit._sum.profit || 0
      },
      recentOrders,
      topProducts
    };
  }
  
  /**
   * Get all orders for admin
   */
  async getAllOrders({ page = 1, limit = 20, status, search }) {
    const skip = (page - 1) * limit;
    
    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { productTitle: { contains: search, mode: 'insensitive' } },
          { customerEmail: { contains: search, mode: 'insensitive' } }
        ]
      })
    };
    
    const [orders, total] = await Promise.all([
      prisma.dropshipOrder.findMany({
        where,
        include: {
          product: {
            select: {
              title: true,
              images: true
            }
          },
          supplier: {
            select: {
              name: true,
              type: true
            }
          },
          customer: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { orderDate: 'desc' }
      }),
      prisma.dropshipOrder.count({ where })
    ]);
    
    return {
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  // =============================================
  // UTILITY FUNCTIONS
  // =============================================
  
  generateSlug(title) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    const random = Math.random().toString(36).substring(2, 8);
    return `${slug}-${random}`;
  }
  
  generateOrderNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `DS-${year}${month}${day}-${random}`;
  }
}

export default new DropshippingService();

