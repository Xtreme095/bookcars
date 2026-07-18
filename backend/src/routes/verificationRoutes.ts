import express from 'express'
import multer from 'multer'
import routeNames from '../config/verificationRoutes.config'
import authJwt from '../middlewares/authJwt'
import * as verificationController from '../controllers/verificationController'

const routes = express.Router()

routes.route(routeNames.createDocument).post([authJwt.verifyToken, multer({ storage: multer.memoryStorage() }).single('file')], verificationController.createVerificationDocument)
routes.route(routeNames.deleteTempDocument).post(authJwt.verifyToken, verificationController.deleteTempVerificationDocument)
routes.route(routeNames.submit).post(authJwt.verifyToken, verificationController.submitVerification)
routes.route(routeNames.getVerification).get(authJwt.verifyToken, verificationController.getVerification)
routes.route(routeNames.getDocument).get(authJwt.verifyToken, verificationController.getVerificationDocument)
routes.route(routeNames.getVerifications).post(authJwt.verifyToken, authJwt.authAdmin, verificationController.getVerifications)
routes.route(routeNames.review).post(authJwt.verifyToken, authJwt.authAdmin, verificationController.reviewVerification)

export default routes
