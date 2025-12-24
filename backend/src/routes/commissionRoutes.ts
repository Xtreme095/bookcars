import express from 'express'
import * as routeNames from '../config/commissionRoutes.config'
import * as authJwt from '../middlewares/authJwt'
import * as commissionController from '../controllers/commissionController'

const routes = express.Router()

/**
 * Calculate commission for a booking.
 *
 * @name POST /api/calculate-commission
 * @middleware authJwt.verifyToken
 */
routes.route(routeNames.calculateCommission).post(authJwt.verifyToken, commissionController.calculateCommission)

/**
 * Get commission transactions with filters.
 *
 * @name GET /api/commission-transactions
 * @middleware authJwt.verifyToken
 */
routes.route(routeNames.commissionTransactions).get(authJwt.verifyToken, commissionController.getCommissionTransactions)

/**
 * Get supplier revenue statistics.
 *
 * @name GET /api/supplier-revenue/:supplierId
 * @middleware authJwt.verifyToken
 */
routes.route(routeNames.supplierRevenue).get(authJwt.verifyToken, commissionController.getSupplierRevenue)

/**
 * Process payout to supplier (Admin only).
 *
 * @name POST /api/process-payout
 * @middleware authJwt.verifyToken
 */
routes.route(routeNames.processPayout).post(authJwt.verifyToken, commissionController.processPayout)

/**
 * Update supplier commission settings (Admin only).
 *
 * @name PUT /api/admin/supplier-commission/:supplierId
 * @middleware authJwt.verifyToken
 */
routes.route(routeNames.updateSupplierCommission).put(authJwt.verifyToken, commissionController.updateSupplierCommission)

/**
 * Get platform statistics (Admin only).
 *
 * @name GET /api/admin/platform-statistics
 * @middleware authJwt.verifyToken
 */
routes.route(routeNames.platformStatistics).get(authJwt.verifyToken, commissionController.getPlatformStatistics)

/**
 * Generate invoice PDF for commission transaction.
 *
 * @name POST /api/commission/generate-invoice/:transactionId
 * @middleware authJwt.verifyToken
 */
routes.route(routeNames.generateInvoice).post(authJwt.verifyToken, commissionController.generateInvoice)

export default routes
