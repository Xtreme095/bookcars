import path from 'node:path'
import asyncFs from 'node:fs/promises'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../config/env.config'
import Booking from '../models/Booking'
import Car from '../models/Car'
import CarUnavailability from '../models/CarUnavailability'
import CommissionTransaction from '../models/CommissionTransaction'
import Payout from '../models/Payout'
import AdditionalDriver from '../models/AdditionalDriver'
import * as helper from './helper'

/**
 * Delete a stored file if it exists.
 *
 * @async
 * @param {string} dir
 * @param {?string} [filename]
 * @returns {Promise<void>}
 */
export const unlinkFile = async (dir: string, filename?: string | null) => {
  if (filename) {
    const file = path.join(dir, path.basename(filename))
    if (await helper.pathExists(file)) {
      await asyncFs.unlink(file)
    }
  }
}

/**
 * Delete a user's identity documents (P2P): host application ID documents and
 * renter verification documents, all stored in the private documents folder.
 *
 * @async
 * @param {env.User} user
 * @returns {Promise<void>}
 */
export const deleteIdentityDocuments = async (user: env.User) => {
  await unlinkFile(env.CDN_HOST_DOCUMENTS, user.host?.idDocFront)
  await unlinkFile(env.CDN_HOST_DOCUMENTS, user.host?.idDocBack)
  for (const docType of Object.values(bookcarsTypes.RenterDocumentType)) {
    await unlinkFile(env.CDN_HOST_DOCUMENTS, user.documents?.[docType])
  }
}

/**
 * Delete everything a fleet owner (supplier or host) owns: bookings (with
 * their additional drivers and rental agreement PDFs), commission ledger
 * entries, cars (with images, registration documents and unavailability
 * periods) and payouts (with statement PDFs).
 *
 * Statements and agreements are legal/accounting documents — export them
 * before deleting an account if they must be retained.
 *
 * @async
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const deleteOwnedFleet = async (userId: string) => {
  // bookings owned by the user (as supplier or host)
  const bookings = await Booking.find({ supplier: userId }).select('_additionalDriver agreement').lean()
  const additionalDrivers = bookings.filter((b) => b._additionalDriver).map((b) => b._additionalDriver)
  await AdditionalDriver.deleteMany({ _id: { $in: additionalDrivers } })
  for (const booking of bookings) {
    await unlinkFile(env.CDN_AGREEMENTS, booking.agreement?.file)
  }
  await CommissionTransaction.deleteMany({ supplier: userId })
  await Booking.deleteMany({ supplier: userId })

  // cars owned by the user
  const cars = await Car.find({ supplier: userId }).select('image images registrationDocument').lean()
  for (const car of cars) {
    await unlinkFile(env.CDN_CARS, car.image)
    for (const image of car.images || []) {
      await unlinkFile(env.CDN_CARS, image)
    }
    await unlinkFile(env.CDN_HOST_DOCUMENTS, car.registrationDocument)
  }
  await CarUnavailability.deleteMany({ car: { $in: cars.map((c) => c._id) } })
  await Car.deleteMany({ supplier: userId })

  // payouts and their statements
  const payouts = await Payout.find({ host: userId }).select('statementFile').lean()
  for (const payout of payouts) {
    await unlinkFile(env.CDN_STATEMENTS, payout.statementFile)
  }
  await Payout.deleteMany({ host: userId })
}

/**
 * Delete a renter's bookings along with their rental agreement PDFs.
 *
 * Commission ledger entries of those bookings are kept — they are the car
 * owner's earnings record and only reference the booking id.
 *
 * @async
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const deleteDriverBookings = async (userId: string) => {
  const bookings = await Booking.find({ driver: userId }).select('agreement').lean()
  for (const booking of bookings) {
    await unlinkFile(env.CDN_AGREEMENTS, booking.agreement?.file)
  }
  await Booking.deleteMany({ driver: userId })
}
