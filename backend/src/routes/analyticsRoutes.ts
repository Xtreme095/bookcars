import express from 'express'
import * as routeNames from '../config/analyticsRoutes.config'
import authJwt from '../middlewares/authJwt'
import * as analyticsController from '../controllers/analyticsController'

const routes = express.Router()

routes.route(routeNames.ANALYTICS_OVERVIEW).get(authJwt.verifyToken, analyticsController.getOverview)
routes.route(routeNames.ANALYTICS_REVENUE).get(authJwt.verifyToken, analyticsController.getRevenueAnalytics)
routes.route(routeNames.ANALYTICS_BOOKINGS).get(authJwt.verifyToken, analyticsController.getBookingAnalytics)
routes.route(routeNames.ANALYTICS_VEHICLES).get(authJwt.verifyToken, analyticsController.getVehicleAnalytics)
routes.route(routeNames.ANALYTICS_CUSTOMERS).get(authJwt.verifyToken, analyticsController.getCustomerAnalytics)
routes.route(routeNames.ANALYTICS_SUPPLIERS).get(authJwt.verifyToken, analyticsController.getSupplierAnalytics)
routes.route(routeNames.ANALYTICS_GENERATE_SUMMARY).post(authJwt.verifyToken, analyticsController.generateDailySummary)

export default routes
