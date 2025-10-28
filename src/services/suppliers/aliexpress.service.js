/**
 * AliExpress Dropshipping API Integration Service
 * Handles product imports and order placement via AliExpress Open Platform
 * API Documentation: https://developers.aliexpress.com/
 */

import axios from 'axios';
import crypto from 'crypto';

class AliExpressService {
  constructor() {
    this.apiURL = 'https://api-sg.aliexpress.com/sync';
    this.appKey = process.env.ALIEXPRESS_APP_KEY || '';
    this.appSecret = process.env.ALIEXPRESS_APP_SECRET || '';
    this.accessToken = process.env.ALIEXPRESS_ACCESS_TOKEN || '';
  }

  /**
   * Generate API signature for authentication
   */
  generateSignature(params) {
    try {
      const sortedParams = Object.keys(params)
        .sort()
        .reduce((acc, key) => {
          acc[key] = params[key];
          return acc;
        }, {});

      const paramString = Object.entries(sortedParams)
        .map(([key, val]) => `${key}${val}`)
        .join('');

      const signString = this.appSecret + paramString + this.appSecret;
      return crypto.createHash('md5').update(signString).digest('hex').toUpperCase();
    } catch (error) {
      console.error('[AliExpress] Signature error:', error.message);
      return '';
    }
  }

  /**
   * Make authenticated API request
   */
  async request(method, params = {}) {
    try {
      const timestamp = Date.now().toString();
      
      const baseParams = {
        app_key: this.appKey,
        method,
        timestamp,
        sign_method: 'md5',
        format: 'json',
        v: '2.0',
        ...params
      };

      // Add signature
      const sign = this.generateSignature(baseParams);
      baseParams.sign = sign;

      const response = await axios.get(this.apiURL, {
        params: baseParams,
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      console.error('[AliExpress] API error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Search products by keyword
   * @param {string} keywords - Search term
   * @param {number} page_no - Page number (default 1)
   * @param {number} page_size - Items per page (default 20)
   */
  async searchProducts(keywords, page_no = 1, page_size = 20) {
    try {
      const response = await this.request('aliexpress.ds.product.get', {
        keywords,
        page_no,
        page_size,
        sort: 'SALE_PRICE_ASC',
        ship_to_country: 'US'
      });

      if (response?.aliexpress_ds_product_get_response) {
        return {
          products: response.aliexpress_ds_product_get_response.result?.products || [],
          total: response.aliexpress_ds_product_get_response.result?.total_results || 0
        };
      }

      return { products: [], total: 0 };
    } catch (error) {
      console.error('[AliExpress] Search error:', error.message);
      return { products: [], total: 0 };
    }
  }

  /**
   * Get product details by product ID
   * @param {string} product_id - AliExpress Product ID
   */
  async getProductDetails(product_id) {
    try {
      const response = await this.request('aliexpress.ds.product.get', {
        product_id,
        target_currency: 'USD',
        target_language: 'EN',
        ship_to_country: 'US'
      });

      if (response?.aliexpress_ds_product_get_response?.result) {
        return response.aliexpress_ds_product_get_response.result;
      }

      return null;
    } catch (error) {
      console.error('[AliExpress] Product details error:', error.message);
      return null;
    }
  }

  /**
   * Get recommended products
   * @param {string} category_id - Category ID
   * @param {number} page_no - Page number
   */
  async getRecommendedProducts(category_id = null, page_no = 1) {
    try {
      const params = {
        page_no,
        page_size: 20,
        target_currency: 'USD',
        target_language: 'EN',
        ship_to_country: 'US'
      };

      if (category_id) {
        params.category_id = category_id;
      }

      const response = await this.request('aliexpress.ds.recommend.feed.get', params);

      if (response?.aliexpress_ds_recommend_feed_get_response?.result) {
        return response.aliexpress_ds_recommend_feed_get_response.result.products || [];
      }

      return [];
    } catch (error) {
      console.error('[AliExpress] Recommended products error:', error.message);
      return [];
    }
  }

  /**
   * Create dropshipping order
   * @param {Object} orderData - Order information
   */
  async createOrder(orderData) {
    try {
      const payload = {
        product_items: JSON.stringify([
          {
            product_id: orderData.supplierProductId,
            quantity: orderData.quantity,
            sku_attr: orderData.variantAttributes || ''
          }
        ]),
        logistics_address: JSON.stringify({
          country: orderData.shippingCountry,
          province: orderData.shippingState,
          city: orderData.shippingCity,
          address: orderData.shippingAddress1,
          address2: orderData.shippingAddress2 || '',
          zip: orderData.shippingZip,
          contact_person: `${orderData.shippingFirstName} ${orderData.shippingLastName}`,
          mobile_no: orderData.shippingPhone,
          phone_country: orderData.phoneCountry || '1'
        }),
        order_id: orderData.orderNumber
      };

      const response = await this.request('aliexpress.ds.order.create', payload);

      if (response?.aliexpress_ds_order_create_response?.result) {
        const result = response.aliexpress_ds_order_create_response.result;
        return {
          success: result.is_success,
          aliexpressOrderId: result.order_id,
          error: result.error_msg || null
        };
      }

      throw new Error('Failed to create AliExpress order');
    } catch (error) {
      console.error('[AliExpress] Create order error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get order tracking information
   * @param {string} orderId - AliExpress Order ID
   */
  async getOrderTracking(orderId) {
    try {
      const response = await this.request('aliexpress.ds.order.get', {
        order_id: orderId
      });

      if (response?.aliexpress_ds_order_get_response?.result) {
        const order = response.aliexpress_ds_order_get_response.result;
        return {
          trackingNumber: order.tracking_code || null,
          carrier: order.logistics_service_name || null,
          status: order.order_status,
          shippedAt: order.ship_time ? new Date(order.ship_time) : null
        };
      }

      return null;
    } catch (error) {
      console.error('[AliExpress] Tracking error:', error.message);
      return null;
    }
  }

  /**
   * Get product categories
   */
  async getCategories() {
    try {
      const response = await this.request('aliexpress.ds.category.get', {
        app_signature: this.appKey
      });

      if (response?.aliexpress_ds_category_get_response?.result) {
        return response.aliexpress_ds_category_get_response.result.categories || [];
      }

      return [];
    } catch (error) {
      console.error('[AliExpress] Categories error:', error.message);
      return [];
    }
  }

  /**
   * Calculate shipping cost
   * @param {string} product_id - Product ID
   * @param {number} quantity - Quantity
   * @param {string} country_code - Destination country
   */
  async calculateShipping(product_id, quantity, country_code) {
    try {
      const response = await this.request('aliexpress.ds.freight.calculate', {
        product_id,
        quantity,
        ship_to_country: country_code
      });

      if (response?.aliexpress_ds_freight_calculate_response?.result) {
        return response.aliexpress_ds_freight_calculate_response.result.freight || [];
      }

      return [];
    } catch (error) {
      console.error('[AliExpress] Shipping calculation error:', error.message);
      return [];
    }
  }

  /**
   * Convert AliExpress product data to our database format
   */
  formatProduct(aeProduct, supplierId) {
    const basePrice = parseFloat(aeProduct.target_sale_price || aeProduct.original_price || 0);
    const markup = 2.5; // 150% markup
    const sellingPrice = parseFloat((basePrice * markup).toFixed(2));
    const comparePrice = parseFloat((sellingPrice * 1.3).toFixed(2));

    return {
      title: aeProduct.product_title || 'Untitled Product',
      description: aeProduct.product_description || aeProduct.product_title || '',
      shortDescription: aeProduct.product_title?.substring(0, 150) || '',
      images: aeProduct.product_main_image_url ? [aeProduct.product_main_image_url] : [],
      category: aeProduct.first_level_category_name || 'Other',
      tags: aeProduct.second_level_category_name ? [aeProduct.second_level_category_name] : [],
      supplierId,
      supplierProductId: aeProduct.product_id?.toString() || '',
      supplierUrl: aeProduct.product_detail_url || null,
      supplierSku: null,
      supplierCost: basePrice,
      sellingPrice,
      compareAtPrice: comparePrice,
      profitMargin: parseFloat((((sellingPrice - basePrice) / sellingPrice) * 100).toFixed(2)),
      profitAmount: parseFloat((sellingPrice - basePrice).toFixed(2)),
      stockQuantity: 100, // AliExpress doesn't provide exact stock
      estimatedShippingDays: '15-30 days',
      weight: null,
      slug: this.generateSlug(aeProduct.product_title),
      status: 'ACTIVE',
      lastSyncedAt: new Date()
    };
  }

  /**
   * Generate URL-friendly slug
   */
  generateSlug(title) {
    if (!title) return 'product-' + Math.random().toString(36).substring(2, 8);
    
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
      if (!this.appKey || !this.appSecret) {
        return {
          status: 'error',
          error: 'API credentials not configured'
        };
      }

      return {
        status: 'ok',
        configured: true
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

export default new AliExpressService();

