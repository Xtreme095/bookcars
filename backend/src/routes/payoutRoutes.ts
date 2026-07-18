import express from 'express'
import routeNames from '../config/payoutRoutes.config'
import authJwt from '../middlewares/authJwt'
import * as payoutController from '../controllers/payoutController'

const routes = express.Router()

routes.route(routeNames.generate).post(authJwt.verifyToken, authJwt.authAdmin, payoutController.generatePayouts)
routes.route(routeNames.getPayouts).post(authJwt.verifyToken, authJwt.authAdmin, payoutController.getPayouts)
routes.route(routeNames.getHostPayouts).get(authJwt.verifyToken, payoutController.getHostPayouts)
routes.route(routeNames.markPaid).post(authJwt.verifyToken, authJwt.authAdmin, payoutController.markPayoutPaid)
routes.route(routeNames.exportSepa).get(authJwt.verifyToken, authJwt.authAdmin, payoutController.exportSepaCsv)
routes.route(routeNames.getStatement).get(authJwt.verifyToken, payoutController.getPayoutStatement)

export default routes
