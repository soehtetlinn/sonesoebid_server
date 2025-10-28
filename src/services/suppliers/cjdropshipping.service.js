/**
 * CJ Dropshipping API Integration Service
 * Handles product imports, order placement, and tracking from CJ Dropshipping
 * API Documentation: https://developers.cjdropshipping.com/
 */

import axios from 'axios';

class CJDropshippingService {
  constructor() {
    this.baseURL = 'https://developers.cjdropshipping.com/api2.0/v1';
    this.email = process.env.CJ_EMAIL || '';
    this.password = process.env.CJ_PASSWORD || '';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get or refresh access token
   */
  async getAccessToken() {
    try {
      // Return cached token if still valid
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      // Request new token
      const response = await axios.post(`${this.baseURL}/authentication/getAccessToken`, {
        email: this.email,
        password: this.password
      });

      if (response.data.code === 200) {
        this.accessToken = response.data.data.accessToken;
        // Token valid for 24 hours, set expiry to 23 hours from now
        this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
        return this.accessToken;
      }

      throw new Error('Failed to get CJ access token');
    } catch (error) {
      console.error('[CJ] Token error:', error.message);
      throw error;
    }
  }

  /**
   * Make authenticated API request
   */
  async request(endpoint, method = 'GET', data = null) {
    try {
      const token = await this.getAccessToken();
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'CJ-Access-Token': token,
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('[CJ] API error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Search products by keyword
   * @param {string} keyword - Search term
   * @param {number} pageNum - Page number (default 1)
   * @param {number} pageSize - Items per page (default 20)
   */
  async searchProducts(keyword, pageNum = 1, pageSize = 20) {
    try {
      const response = await this.request('/product/list', 'POST', {
        productNameEn: keyword,
        pageNum,
        pageSize
      });

      if (response.code === 200) {
        return response.data;
      }

      throw new Error('Failed to search products');
    } catch (error) {
      console.error('[CJ] Search error:', error.message);
      return { list: [], total: 0 };
    }
  }

  /**
   * Get product details by product ID
   * @param {string} pid - CJ Product ID
   */
  async getProductDetails(pid) {
    try {
      const response = await this.request('/product/query', 'POST', {
        pid
      });

      if (response.code === 200 && response.data) {
        return response.data;
      }

      throw new Error('Product not found');
    } catch (error) {
      console.error('[CJ] Product details error:', error.message);
      return null;
    }
  }

  /**
   * Get product variant details (sizes, colors, pricing)
   * @param {string} pid - CJ Product ID
   */
  async getProductVariants(pid) {
    try {
      const response = await this.request('/product/variant/query', 'POST', {
        pid
      });

      if (response.code === 200) {
        return response.data?.variants || [];
      }

      return [];
    } catch (error) {
      console.error('[CJ] Variants error:', error.message);
      return [];
    }
  }

  /**
   * Create order on CJ platform
   * @param {Object} orderData - Order information
   */
  async createOrder(orderData) {
    try {
      const payload = {
        orderNumber: orderData.orderNumber, // Your order ID
        shippingAddress: {
          country: orderData.shippingCountry,
          province: orderData.shippingState,
          city: orderData.shippingCity,
          addressLine1: orderData.shippingAddress1,
          addressLine2: orderData.shippingAddress2 || '',
          zipCode: orderData.shippingZip,
          contactName: `${orderData.shippingFirstName} ${orderData.shippingLastName}`,
          phone: orderData.shippingPhone,
          email: orderData.customerEmail
        },
        products: [
          {
            pid: orderData.supplierProductId,
            variantId: orderData.variantId || null,
            quantity: orderData.quantity
          }
        ],
        shippingMethod: orderData.shippingMethod || 'CJPacket Ordinary',
        remark: orderData.notes || ''
      };

      const response = await this.request('/order/create', 'POST', payload);

      if (response.code === 200) {
        return {
          success: true,
          cjOrderId: response.data.orderId,
          cjOrderNumber: response.data.orderNumber
        };
      }

      throw new Error(response.message || 'Failed to create order');
    } catch (error) {
      console.error('[CJ] Create order error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get order tracking information
   * @param {string} cjOrderId - CJ Order ID
   */
  async getOrderTracking(cjOrderId) {
    try {
      const response = await this.request('/logistic/trackQuery', 'POST', {
        orderId: cjOrderId
      });

      if (response.code === 200 && response.data) {
        return {
          trackingNumber: response.data.trackNumber,
          carrier: response.data.logisticName,
          trackingUrl: response.data.trackUrl,
          status: response.data.orderStatus,
          statusHistory: response.data.trackList || []
        };
      }

      return null;
    } catch (error) {
      console.error('[CJ] Tracking error:', error.message);
      return null;
    }
  }

  /**
   * Get shipping methods for a product
   * @param {string} pid - CJ Product ID
   * @param {string} countryCode - Destination country code
   */
  async getShippingMethods(pid, countryCode) {
    try {
      const response = await this.request('/logistic/freightCalculate', 'POST', {
        products: [{ pid, quantity: 1 }],
        country: countryCode
      });

      if (response.code === 200) {
        return response.data?.shippingMethods || [];
      }

      return [];
    } catch (error) {
      console.error('[CJ] Shipping methods error:', error.message);
      return [];
    }
  }

  /**
   * Convert CJ product data to our database format
   */
  formatProduct(cjProduct, supplierId) {
    const basePrice = parseFloat(cjProduct.sellPrice || 0);
    const markup = 2.5; // 150% markup
    const sellingPrice = parseFloat((basePrice * markup).toFixed(2));
    const comparePrice = parseFloat((sellingPrice * 1.5).toFixed(2));

    return {
      title: cjProduct.productNameEn || 'Untitled Product',
      description: cjProduct.description || cjProduct.productNameEn || '',
      shortDescription: cjProduct.description?.substring(0, 150) || '',
      images: cjProduct.productImage ? [cjProduct.productImage] : [],
      category: cjProduct.categoryName || 'Other',
      tags: cjProduct.keywords ? cjProduct.keywords.split(',').map(k => k.trim()) : [],
      supplierId,
      supplierProductId: cjProduct.pid,
      supplierUrl: cjProduct.productUrl || null,
      supplierSku: cjProduct.productSku || null,
      supplierCost: basePrice,
      sellingPrice,
      compareAtPrice: comparePrice,
      profitMargin: parseFloat((((sellingPrice - basePrice) / sellingPrice) * 100).toFixed(2)),
      profitAmount: parseFloat((sellingPrice - basePrice).toFixed(2)),
      stockQuantity: cjProduct.sellQuantity || 100,
      estimatedShippingDays: '7-15 days',
      weight: parseFloat(cjProduct.packWeight || 0),
      slug: this.generateSlug(cjProduct.productNameEn),
      status: 'ACTIVE',
      lastSyncedAt: new Date()
    };
  }

  /**
   * Generate URL-friendly slug
   */
  generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .substring(0, 100) + '-' + Math.random().toString(36).substring(2, 8);
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const token = await this.getAccessToken();
      return {
        status: 'ok',
        authenticated: !!token
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

export default new CJDropshippingService();

