/**
 * Product Import Service
 * Handles bulk product imports from CJ Dropshipping and AliExpress
 */

import { PrismaClient } from '@prisma/client';
import cjService from './suppliers/cjdropshipping.service.js';
import aliexpressService from './suppliers/aliexpress.service.js';

const prisma = new PrismaClient();

class ProductImportService {
  /**
   * Import products from CJ Dropshipping by keyword search
   * @param {string} keyword - Search term
   * @param {number} maxProducts - Maximum products to import (default 20)
   * @param {number} userId - User ID who initiated the import
   */
  async importFromCJ(keyword, maxProducts = 20, userId) {
    console.log(`[Import] Starting CJ import: "${keyword}" (max: ${maxProducts})`);
    
    try {
      // Get CJ supplier
      const supplier = await prisma.dropshipSupplier.findFirst({
        where: { type: 'CJ_DROPSHIPPING', isActive: true }
      });

      if (!supplier) {
        throw new Error('CJ Dropshipping supplier not configured');
      }

      // Search products
      const searchResults = await cjService.searchProducts(keyword, 1, maxProducts);
      
      if (!searchResults || !searchResults.list || searchResults.list.length === 0) {
        return {
          success: true,
          imported: 0,
          failed: 0,
          message: 'No products found'
        };
      }

      console.log(`[Import] Found ${searchResults.list.length} products from CJ`);

      const results = {
        success: 0,
        failed: 0,
        errors: [],
        products: []
      };

      // Import each product
      for (const cjProduct of searchResults.list) {
        try {
          // Get detailed product info
          const details = await cjService.getProductDetails(cjProduct.pid);
          const productData = cjService.formatProduct(details || cjProduct, supplier.id);

          // Check if product already exists
          const existing = await prisma.dropshipProduct.findFirst({
            where: {
              supplierProductId: productData.supplierProductId,
              supplierId: supplier.id
            }
          });

          let product;
          if (existing) {
            // Update existing product
            product = await prisma.dropshipProduct.update({
              where: { id: existing.id },
              data: productData
            });
            console.log(`[Import] ✅ Updated: ${product.title}`);
          } else {
            // Create new product
            product = await prisma.dropshipProduct.create({
              data: productData
            });
            console.log(`[Import] ✅ Created: ${product.title}`);
          }

          results.success++;
          results.products.push(product);
        } catch (error) {
          results.failed++;
          results.errors.push({
            pid: cjProduct.pid,
            error: error.message
          });
          console.error(`[Import] ❌ Failed to import ${cjProduct.pid}:`, error.message);
        }
      }

      // Log import
      await this.logImport({
        supplier: 'CJ Dropshipping',
        totalProducts: searchResults.list.length,
        successCount: results.success,
        failedCount: results.failed,
        errors: results.errors,
        importedBy: userId
      });

      console.log(`[Import] ✅ Import complete: ${results.success} success, ${results.failed} failed`);
      return {
        success: true,
        imported: results.success,
        failed: results.failed,
        products: results.products,
        errors: results.errors
      };
    } catch (error) {
      console.error('[Import] CJ import error:', error.message);
      throw error;
    }
  }

  /**
   * Import products from AliExpress by keyword search
   * @param {string} keyword - Search term
   * @param {number} maxProducts - Maximum products to import (default 20)
   * @param {number} userId - User ID who initiated the import
   */
  async importFromAliExpress(keyword, maxProducts = 20, userId) {
    console.log(`[Import] Starting AliExpress import: "${keyword}" (max: ${maxProducts})`);
    
    try {
      // Get AliExpress supplier
      const supplier = await prisma.dropshipSupplier.findFirst({
        where: { type: 'ALIEXPRESS', isActive: true }
      });

      if (!supplier) {
        throw new Error('AliExpress supplier not configured');
      }

      // Search products
      const { products: aeProducts } = await aliexpressService.searchProducts(
        keyword,
        1,
        Math.min(maxProducts, 50) // AliExpress limits page size
      );
      
      if (!aeProducts || aeProducts.length === 0) {
        return {
          success: true,
          imported: 0,
          failed: 0,
          message: 'No products found'
        };
      }

      console.log(`[Import] Found ${aeProducts.length} products from AliExpress`);

      const results = {
        success: 0,
        failed: 0,
        errors: [],
        products: []
      };

      // Import each product
      for (const aeProduct of aeProducts.slice(0, maxProducts)) {
        try {
          // Get detailed product info
          const details = await aliexpressService.getProductDetails(aeProduct.product_id);
          const productData = aliexpressService.formatProduct(details || aeProduct, supplier.id);

          // Check if product already exists
          const existing = await prisma.dropshipProduct.findFirst({
            where: {
              supplierProductId: productData.supplierProductId,
              supplierId: supplier.id
            }
          });

          let product;
          if (existing) {
            // Update existing product
            product = await prisma.dropshipProduct.update({
              where: { id: existing.id },
              data: productData
            });
            console.log(`[Import] ✅ Updated: ${product.title}`);
          } else {
            // Create new product
            product = await prisma.dropshipProduct.create({
              data: productData
            });
            console.log(`[Import] ✅ Created: ${product.title}`);
          }

          results.success++;
          results.products.push(product);
        } catch (error) {
          results.failed++;
          results.errors.push({
            product_id: aeProduct.product_id,
            error: error.message
          });
          console.error(`[Import] ❌ Failed to import ${aeProduct.product_id}:`, error.message);
        }
      }

      // Log import
      await this.logImport({
        supplier: 'AliExpress',
        totalProducts: aeProducts.length,
        successCount: results.success,
        failedCount: results.failed,
        errors: results.errors,
        importedBy: userId
      });

      console.log(`[Import] ✅ Import complete: ${results.success} success, ${results.failed} failed`);
      return {
        success: true,
        imported: results.success,
        failed: results.failed,
        products: results.products,
        errors: results.errors
      };
    } catch (error) {
      console.error('[Import] AliExpress import error:', error.message);
      throw error;
    }
  }

  /**
   * Import recommended/trending products
   * @param {string} supplierType - 'CJ_DROPSHIPPING' or 'ALIEXPRESS'
   * @param {number} maxProducts - Maximum products to import
   * @param {number} userId - User ID who initiated the import
   */
  async importRecommended(supplierType, maxProducts = 20, userId) {
    console.log(`[Import] Importing ${maxProducts} recommended products from ${supplierType}`);

    try {
      if (supplierType === 'CJ_DROPSHIPPING') {
        // CJ doesn't have a recommended endpoint, use popular keywords
        const keywords = ['electronics', 'fashion', 'home', 'beauty', 'sports'];
        const keyword = keywords[Math.floor(Math.random() * keywords.length)];
        return await this.importFromCJ(keyword, maxProducts, userId);
      } else if (supplierType === 'ALIEXPRESS') {
        const supplier = await prisma.dropshipSupplier.findFirst({
          where: { type: 'ALIEXPRESS', isActive: true }
        });

        if (!supplier) {
          throw new Error('AliExpress supplier not configured');
        }

        const aeProducts = await aliexpressService.getRecommendedProducts(null, 1);
        
        const results = {
          success: 0,
          failed: 0,
          errors: [],
          products: []
        };

        for (const aeProduct of aeProducts.slice(0, maxProducts)) {
          try {
            const productData = aliexpressService.formatProduct(aeProduct, supplier.id);

            const existing = await prisma.dropshipProduct.findFirst({
              where: {
                supplierProductId: productData.supplierProductId,
                supplierId: supplier.id
              }
            });

            let product;
            if (existing) {
              product = await prisma.dropshipProduct.update({
                where: { id: existing.id },
                data: productData
              });
            } else {
              product = await prisma.dropshipProduct.create({
                data: productData
              });
            }

            results.success++;
            results.products.push(product);
          } catch (error) {
            results.failed++;
            results.errors.push({
              product_id: aeProduct.product_id,
              error: error.message
            });
          }
        }

        await this.logImport({
          supplier: 'AliExpress (Recommended)',
          totalProducts: aeProducts.length,
          successCount: results.success,
          failedCount: results.failed,
          errors: results.errors,
          importedBy: userId
        });

        return {
          success: true,
          imported: results.success,
          failed: results.failed,
          products: results.products,
          errors: results.errors
        };
      }

      throw new Error('Invalid supplier type');
    } catch (error) {
      console.error('[Import] Recommended import error:', error.message);
      throw error;
    }
  }

  /**
   * Sync existing products with supplier (update prices, stock, etc.)
   * @param {string} supplierId - Supplier ID (optional, syncs all if not provided)
   */
  async syncProducts(supplierId = null) {
    try {
      const where = { isActive: true };
      if (supplierId) {
        where.supplierId = supplierId;
      }

      const products = await prisma.dropshipProduct.findMany({
        where,
        include: { supplier: true }
      });

      console.log(`[Import] Syncing ${products.length} products...`);

      const results = {
        updated: 0,
        failed: 0,
        unchanged: 0
      };

      for (const product of products) {
        try {
          let details;
          
          if (product.supplier.type === 'CJ_DROPSHIPPING') {
            details = await cjService.getProductDetails(product.supplierProductId);
          } else if (product.supplier.type === 'ALIEXPRESS') {
            details = await aliexpressService.getProductDetails(product.supplierProductId);
          }

          if (!details) {
            results.unchanged++;
            continue;
          }

          // Check if price or stock changed
          const basePrice = parseFloat(details.sellPrice || details.target_sale_price || 0);
          const newSellingPrice = parseFloat((basePrice * 2.5).toFixed(2));

          if (Math.abs(newSellingPrice - product.sellingPrice) > 0.01) {
            await prisma.dropshipProduct.update({
              where: { id: product.id },
              data: {
                supplierCost: basePrice,
                sellingPrice: newSellingPrice,
                profitAmount: newSellingPrice - basePrice,
                profitMargin: ((newSellingPrice - basePrice) / newSellingPrice) * 100,
                lastSyncedAt: new Date()
              }
            });
            results.updated++;
            console.log(`[Import] ✅ Synced: ${product.title}`);
          } else {
            results.unchanged++;
          }
        } catch (error) {
          results.failed++;
          console.error(`[Import] ❌ Sync failed for ${product.id}:`, error.message);
        }
      }

      console.log(`[Import] ✅ Sync complete: ${results.updated} updated, ${results.unchanged} unchanged, ${results.failed} failed`);
      return results;
    } catch (error) {
      console.error('[Import] Sync error:', error.message);
      throw error;
    }
  }

  /**
   * Log import activity
   */
  async logImport(data) {
    try {
      await prisma.dropshipImportLog.create({
        data: {
          supplier: data.supplier,
          totalProducts: data.totalProducts,
          successCount: data.successCount,
          failedCount: data.failedCount,
          errors: data.errors,
          importedBy: data.importedBy
        }
      });
    } catch (error) {
      console.error('[Import] Failed to log import:', error.message);
    }
  }

  /**
   * Get import history
   */
  async getImportHistory(limit = 10) {
    try {
      return await prisma.dropshipImportLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit
      });
    } catch (error) {
      console.error('[Import] Get history error:', error.message);
      return [];
    }
  }
}

export default new ProductImportService();

