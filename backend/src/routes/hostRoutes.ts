import express from 'express'
import multer from 'multer'
import routeNames from '../config/hostRoutes.config'
import authJwt from '../middlewares/authJwt'
import * as hostController from '../controllers/hostController'

const routes = express.Router()

routes.route(routeNames.apply).post(authJwt.verifyToken, hostController.apply)
routes.route(routeNames.getHostApplication).get(authJwt.verifyToken, hostController.getHostApplication)
routes.route(routeNames.createHostDocument).post([authJwt.verifyToken, multer({ storage: multer.memoryStorage() }).single('file')], hostController.createHostDocument)
routes.route(routeNames.deleteTempHostDocument).post(authJwt.verifyToken, hostController.deleteTempHostDocument)
routes.route(routeNames.getHostDocument).get(authJwt.verifyToken, hostController.getHostDocument)
routes.route(routeNames.getHosts).post(authJwt.verifyToken, authJwt.authAdmin, hostController.getHosts)
routes.route(routeNames.getHost).get(authJwt.verifyToken, authJwt.authAdmin, hostController.getHost)
routes.route(routeNames.reviewHost).post(authJwt.verifyToken, authJwt.authAdmin, hostController.reviewHost)

export default routes
