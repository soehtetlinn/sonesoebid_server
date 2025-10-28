/**
 * Order Automation Service
 * Handles automatic order processing, supplier forwarding, and tracking updates
 */

import { PrismaClient } from '@prisma/client';
import cjService from './suppliers/cjdropshipping.service.js';
import aliexpressService from './suppliers/aliexpress.service.js';

const prisma = new PrismaClient();

class OrderAutomationService {
  /**
   * Process a new order and forward to supplier
   * @param {string} orderId - Order ID from database
   */
  async processOrder(orderId) {
    try {
      const order = await prisma.dropshipOrder.findUnique({
        where: { id: orderId },
        include: {
          product: true,
          supplier: true,
          customer: true
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Check if already processed
      if (order.status !== 'PENDING') {
        console.log(`[Automation] Order ${orderId} already processed (${order.status})`);
        return { success: false, message: 'Order already processed' };
      }

      console.log(`[Automation] Processing order ${order.orderNumber}...`);

      // Determine which supplier service to use
      let result;
      if (order.supplier.type === 'CJ_DROPSHIPPING') {
        result = await this.processCJOrder(order);
      } else if (order.supplier.type === 'ALIEXPRESS') {
        result = await this.processAliExpressOrder(order);
      } else {
        result = await this.processCustomSupplierOrder(order);
      }

      if (result.success) {
        // Update order status
        await prisma.dropshipOrder.update({
          where: { id: orderId },
          data: {
            status: 'PROCESSING',
            supplierOrderId: result.supplierOrderId,
            supplierOrderNumber: result.supplierOrderNumber || null,
            processedAt: new Date(),
            isAutomated: true,
            statusHistory: {
              push: {
                status: 'PROCESSING',
                timestamp: new Date(),
                note: 'Order automatically sent to supplier'
              }
            }
          }
        });

        console.log(`[Automation] ✅ Order ${order.orderNumber} sent to supplier`);
        return { success: true, supplierOrderId: result.supplierOrderId };
      } else {
        // Mark order for manual review
        await prisma.dropshipOrder.update({
          where: { id: orderId },
          data: {
            requiresAttention: true,
            notes: `Automation failed: ${result.error}`,
            statusHistory: {
              push: {
                status: 'PENDING',
                timestamp: new Date(),
                note: `Automation error: ${result.error}`
              }
            }
          }
        });

        console.error(`[Automation] ❌ Order ${order.orderNumber} failed: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('[Automation] Process order error:', error.message);
      throw error;
    }
  }

  /**
   * Process order through CJ Dropshipping
   */
  async processCJOrder(order) {
    try {
      const orderData = {
        orderNumber: order.orderNumber,
        supplierProductId: order.product.supplierProductId,
        quantity: order.quantity,
        shippingCountry: order.shippingCountry,
        shippingState: order.shippingState,
        shippingCity: order.shippingCity,
        shippingAddress1: order.shippingAddress1,
        shippingAddress2: order.shippingAddress2,
        shippingZip: order.shippingZip,
        shippingFirstName: order.shippingFirstName,
        shippingLastName: order.shippingLastName,
        shippingPhone: order.shippingPhone,
        customerEmail: order.customerEmail,
        notes: order.customerNotes
      };

      const result = await cjService.createOrder(orderData);
      
      if (result.success) {
        return {
          success: true,
          supplierOrderId: result.cjOrderId,
          supplierOrderNumber: result.cjOrderNumber
        };
      }

      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Process order through AliExpress
   */
  async processAliExpressOrder(order) {
    try {
      const orderData = {
        orderNumber: order.orderNumber,
        supplierProductId: order.product.supplierProductId,
        quantity: order.quantity,
        shippingCountry: order.shippingCountry,
        shippingState: order.shippingState,
        shippingCity: order.shippingCity,
        shippingAddress1: order.shippingAddress1,
        shippingAddress2: order.shippingAddress2,
        shippingZip: order.shippingZip,
        shippingFirstName: order.shippingFirstName,
        shippingLastName: order.shippingLastName,
        shippingPhone: order.shippingPhone,
        phoneCountry: '1' // US country code, adjust as needed
      };

      const result = await aliexpressService.createOrder(orderData);
      
      if (result.success) {
        return {
          success: true,
          supplierOrderId: result.aliexpressOrderId,
          supplierOrderNumber: null
        };
      }

      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle custom supplier orders (manual processing)
   */
  async processCustomSupplierOrder(order) {
    // For custom suppliers, mark for manual processing
    return {
      success: false,
      error: 'Custom supplier - requires manual processing'
    };
  }

  /**
   * Update tracking information for all processing orders
   */
  async updateAllTracking() {
    try {
      const orders = await prisma.dropshipOrder.findMany({
        where: {
          status: {
            in: ['PROCESSING', 'CONFIRMED', 'SHIPPED', 'IN_TRANSIT']
          },
          supplierOrderId: { not: null }
        },
        include: {
          supplier: true
        }
      });

      console.log(`[Automation] Updating tracking for ${orders.length} orders...`);

      let updated = 0;
      for (const order of orders) {
        const result = await this.updateOrderTracking(order.id);
        if (result.updated) updated++;
      }

      console.log(`[Automation] ✅ Updated ${updated}/${orders.length} orders`);
      return { total: orders.length, updated };
    } catch (error) {
      console.error('[Automation] Update tracking error:', error.message);
      throw error;
    }
  }

  /**
   * Update tracking for a specific order
   */
  async updateOrderTracking(orderId) {
    try {
      const order = await prisma.dropshipOrder.findUnique({
        where: { id: orderId },
        include: { supplier: true }
      });

      if (!order || !order.supplierOrderId) {
        return { updated: false, reason: 'No supplier order ID' };
      }

      let trackingInfo;
      if (order.supplier.type === 'CJ_DROPSHIPPING') {
        trackingInfo = await cjService.getOrderTracking(order.supplierOrderId);
      } else if (order.supplier.type === 'ALIEXPRESS') {
        trackingInfo = await aliexpressService.getOrderTracking(order.supplierOrderId);
      }

      if (!trackingInfo) {
        return { updated: false, reason: 'No tracking info available' };
      }

      // Update order with tracking info
      const updateData = {};
      let statusChanged = false;

      if (trackingInfo.trackingNumber && trackingInfo.trackingNumber !== order.trackingNumber) {
        updateData.trackingNumber = trackingInfo.trackingNumber;
        updateData.trackingCarrier = trackingInfo.carrier;
        updateData.trackingUrl = trackingInfo.trackingUrl;
      }

      // Map supplier status to our status
      const newStatus = this.mapSupplierStatus(trackingInfo.status, order.supplier.type);
      if (newStatus && newStatus !== order.status) {
        updateData.status = newStatus;
        statusChanged = true;

        if (newStatus === 'SHIPPED' && !order.shippedAt) {
          updateData.shippedAt = new Date();
        } else if (newStatus === 'DELIVERED' && !order.deliveredAt) {
          updateData.deliveredAt = new Date();
        }

        updateData.statusHistory = {
          push: {
            status: newStatus,
            timestamp: new Date(),
            note: 'Status updated automatically from supplier'
          }
        };
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.dropshipOrder.update({
          where: { id: orderId },
          data: updateData
        });

        console.log(`[Automation] ✅ Updated order ${order.orderNumber}: ${statusChanged ? `${order.status} → ${newStatus}` : 'tracking info'}`);
        return { updated: true, changes: updateData };
      }

      return { updated: false, reason: 'No changes' };
    } catch (error) {
      console.error(`[Automation] Update tracking error for ${orderId}:`, error.message);
      return { updated: false, reason: error.message };
    }
  }

  /**
   * Map supplier-specific status to our standard status
   */
  mapSupplierStatus(supplierStatus, supplierType) {
    const statusMappings = {
      CJ_DROPSHIPPING: {
        'AWAITING_PAYMENT': 'PENDING',
        'PAID': 'PROCESSING',
        'IN_STOCK': 'CONFIRMED',
        'SHIPPED': 'SHIPPED',
        'IN_TRANSIT': 'IN_TRANSIT',
        'DELIVERED': 'DELIVERED',
        'CANCELLED': 'CANCELLED',
        'REFUNDED': 'REFUNDED'
      },
      ALIEXPRESS: {
        'WAIT_BUYER_ACCEPT_GOODS': 'SHIPPED',
        'FINISH': 'DELIVERED',
        'CANCEL': 'CANCELLED',
        'WAIT_SELLER_SEND_GOODS': 'PROCESSING',
        'SELLER_PART_SEND_GOODS': 'PROCESSING',
        'WAIT_SELLER_EXAMINE_MONEY': 'CONFIRMED'
      }
    };

    const mapping = statusMappings[supplierType];
    return mapping ? mapping[supplierStatus] : null;
  }

  /**
   * Start automated tracking updates (cron job)
   * Updates every 6 hours
   */
  startTrackingCron() {
    // Update immediately on start
    this.updateAllTracking().catch(err => 
      console.error('[Automation] Initial tracking update failed:', err)
    );

    // Then update every 6 hours
    setInterval(() => {
      this.updateAllTracking().catch(err => 
        console.error('[Automation] Scheduled tracking update failed:', err)
      );
    }, 6 * 60 * 60 * 1000); // 6 hours

    console.log('[Automation] 🤖 Tracking automation started (updates every 6 hours)');
  }

  /**
   * Process all pending orders
   */
  async processAllPendingOrders() {
    try {
      const pendingOrders = await prisma.dropshipOrder.findMany({
        where: {
          status: 'PENDING',
          requiresAttention: false
        },
        orderBy: { orderDate: 'asc' },
        take: 50 // Process max 50 at a time
      });

      console.log(`[Automation] Processing ${pendingOrders.length} pending orders...`);

      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      for (const order of pendingOrders) {
        try {
          const result = await this.processOrder(order.id);
          if (result.success) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push({ orderId: order.id, error: result.error });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({ orderId: order.id, error: error.message });
        }
      }

      console.log(`[Automation] ✅ Processed: ${results.success} success, ${results.failed} failed`);
      return results;
    } catch (error) {
      console.error('[Automation] Process pending orders error:', error.message);
      throw error;
    }
  }
}

export default new OrderAutomationService();

