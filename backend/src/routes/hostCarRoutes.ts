import express from 'express'
import multer from 'multer'
import routeNames from '../config/hostCarRoutes.config'
import authJwt from '../middlewares/authJwt'
import * as hostCarController from '../controllers/hostCarController'

const routes = express.Router()

routes.route(routeNames.create).post(authJwt.verifyToken, hostCarController.createHostCar)
routes.route(routeNames.update).put(authJwt.verifyToken, hostCarController.updateHostCar)
routes.route(routeNames.submit).post(authJwt.verifyToken, hostCarController.submitHostCar)
routes.route(routeNames.delete).post(authJwt.verifyToken, hostCarController.deleteHostCar)
routes.route(routeNames.getHostCar).get(authJwt.verifyToken, hostCarController.getHostCar)
routes.route(routeNames.getHostCars).post(authJwt.verifyToken, hostCarController.getHostCars)
routes.route(routeNames.createImage).post([authJwt.verifyToken, multer({ storage: multer.memoryStorage() }).single('image')], hostCarController.createHostCarImage)
routes.route(routeNames.deleteTempImage).post(authJwt.verifyToken, hostCarController.deleteTempHostCarImage)
routes.route(routeNames.getRegistrationDocument).get(authJwt.verifyToken, hostCarController.getCarRegistrationDocument)
routes.route(routeNames.createUnavailability).post(authJwt.verifyToken, hostCarController.createCarUnavailability)
routes.route(routeNames.deleteUnavailability).post(authJwt.verifyToken, hostCarController.deleteCarUnavailability)
routes.route(routeNames.getUnavailabilities).get(authJwt.verifyToken, hostCarController.getCarUnavailabilities)
routes.route(routeNames.getAdminHostCars).post(authJwt.verifyToken, authJwt.authAdmin, hostCarController.getAdminHostCars)
routes.route(routeNames.review).post(authJwt.verifyToken, authJwt.authAdmin, hostCarController.reviewHostCar)

export default routes
