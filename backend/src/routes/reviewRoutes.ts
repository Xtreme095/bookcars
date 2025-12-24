import express from 'express'
import * as routeNames from '../config/reviewRoutes.config'
import authJwt from '../middlewares/authJwt'
import * as reviewController from '../controllers/reviewController'

const routes = express.Router()

routes.route(routeNames.REVIEW_SUBMIT).post(authJwt.verifyToken, reviewController.submitReview)
routes.route(routeNames.REVIEW_CAR_REVIEWS).get(reviewController.getCarReviews)
routes.route(routeNames.REVIEW_SUPPLIER_REVIEWS).get(reviewController.getSupplierReviews)
routes.route(routeNames.REVIEW_RESPOND).post(authJwt.verifyToken, reviewController.respondToReview)
routes.route(routeNames.REVIEW_MARK_HELPFUL).post(authJwt.verifyToken, reviewController.markHelpful)
routes.route(routeNames.REVIEW_REPORT).post(authJwt.verifyToken, reviewController.reportReview)
routes.route(routeNames.REVIEW_MODERATE).post(authJwt.verifyToken, reviewController.moderateReview)
routes.route(routeNames.REVIEW_PENDING).get(authJwt.verifyToken, reviewController.getPendingReviews)
routes.route(routeNames.REVIEW_CHECK_CAN_REVIEW).get(authJwt.verifyToken, reviewController.checkCanReview)

export default routes
