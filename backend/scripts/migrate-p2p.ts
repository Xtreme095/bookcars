import 'dotenv/config'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../src/config/env.config'
import * as logger from '../src/utils/logger'
import * as databaseHelper from '../src/utils/databaseHelper'
import Car from '../src/models/Car'

//
// P2P migration (idempotent): stamp `status` and `hostCar` on cars created
// before the P2P extension. Existing cars keep their behavior:
// available -> active, unavailable -> suspended; none of them are host cars.
//
if (
  await databaseHelper.connect(env.DB_URI, env.DB_SSL, env.DB_DEBUG)
) {
  const activeResult = await Car.updateMany(
    { status: { $exists: false }, available: true },
    { $set: { status: bookcarsTypes.CarStatus.Active, hostCar: false } },
  )
  logger.info(`${activeResult.modifiedCount} available car(s) set to active`)

  const suspendedResult = await Car.updateMany(
    { status: { $exists: false }, available: { $in: [false, null] } },
    { $set: { status: bookcarsTypes.CarStatus.Suspended, hostCar: false } },
  )
  logger.info(`${suspendedResult.modifiedCount} unavailable car(s) set to suspended`)

  const hostCarResult = await Car.updateMany(
    { hostCar: { $exists: false } },
    { $set: { hostCar: false } },
  )
  logger.info(`${hostCarResult.modifiedCount} car(s) stamped hostCar=false`)

  await databaseHelper.close()
  logger.info('MongoDB connection closed')
  process.exit(0)
}
