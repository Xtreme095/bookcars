import path from 'node:path'
import asyncFs from 'node:fs/promises'
import escapeStringRegexp from 'escape-string-regexp'
import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { nanoid } from 'nanoid'
import nodemailer from 'nodemailer'
import * as bookcarsTypes from ':bookcars-types'
import i18n from '../lang/i18n'
import * as env from '../config/env.config'
import User from '../models/User'
import Car from '../models/Car'
import Booking from '../models/Booking'
import CarUnavailability from '../models/CarUnavailability'
import Notification from '../models/Notification'
import NotificationCounter from '../models/NotificationCounter'
import * as helper from '../utils/helper'
import * as logger from '../utils/logger'
import * as mailHelper from '../utils/mailHelper'

/**
 * Platform defaults applied to host-listed cars. Hosts only set price, deposit
 * and vehicle facts; rental options (cancellation, insurances, additional
 * driver) are platform-level decisions and are not offered per host car yet.
 */
const HOST_CAR_DEFAULTS = {
  minimumAge: env.MINIMUM_AGE,
  cancellation: 0, // free cancellation
  amendments: -1, // unavailable
  theftProtection: -1,
  collisionDamageWaiver: -1,
  fullInsurance: -1,
  additionalDriver: -1,
}

/**
 * Save an in-app notification and send an email to a user.
 *
 * @async
 * @param {env.User} user
 * @param {string} message
 * @param {string} link
 * @param {?string} [emailBody]
 * @returns {Promise<void>}
 */
const notify = async (user: env.User, message: string, link: string, emailBody?: string) => {
  const notification = new Notification({
    user: user._id,
    message,
  })
  await notification.save()

  let counter = await NotificationCounter.findOne({ user: user._id })
  if (counter && typeof counter.count !== 'undefined') {
    counter.count += 1
    await counter.save()
  } else {
    counter = new NotificationCounter({ user: user._id, count: 1 })
    await counter.save()
  }

  if (user.enableEmailNotifications) {
    const mailOptions: nodemailer.SendMailOptions = {
      from: env.SMTP_FROM,
      to: user.email,
      subject: message,
      html: `<p>
    ${i18n.t('HELLO')}${user.fullName},<br><br>
    ${emailBody || message}<br><br>
    ${link}<br><br>
    ${i18n.t('REGARDS')}<br>
    </p>`,
    }

    await mailHelper.sendMail(mailOptions)
  }
}

/**
 * Get the session user if they are an approved host.
 *
 * @async
 * @param {Request} req
 * @returns {Promise<env.User | null>}
 */
const getApprovedHost = async (req: Request) => {
  const user = await User.findById(req.user?._id)
  if (!user || !user.host || user.host.status !== bookcarsTypes.HostStatus.Approved) {
    return null
  }
  return user
}

/**
 * Move a temp car image into the cars CDN folder if needed.
 * Returns the permanent filename, or null when the file is unknown.
 *
 * @async
 * @param {string} filename
 * @returns {Promise<string | null>}
 */
const saveCarImage = async (filename: string) => {
  const safeFilename = path.basename(filename)
  const tempFile = path.join(env.CDN_TEMP_CARS, safeFilename)

  if (await helper.pathExists(tempFile)) {
    const permanentFilename = `${nanoid()}${path.extname(safeFilename)}`
    await asyncFs.rename(tempFile, path.join(env.CDN_CARS, permanentFilename))
    return permanentFilename
  }

  if (await helper.pathExists(path.join(env.CDN_CARS, safeFilename))) {
    return safeFilename
  }

  return null
}

/**
 * Move a temp registration document (prometna dozvola) into the private
 * host-documents folder if needed. Returns the stored filename.
 *
 * @async
 * @param {env.Car} car
 * @param {string} filename
 * @returns {Promise<string | null>}
 */
const saveRegistrationDocument = async (car: env.Car, filename: string) => {
  const safeFilename = path.basename(filename)
  const tempFile = path.join(env.CDN_TEMP_HOST_DOCUMENTS, safeFilename)

  if (await helper.pathExists(tempFile)) {
    if (car.registrationDocument) {
      const previous = path.join(env.CDN_HOST_DOCUMENTS, path.basename(car.registrationDocument))
      if (await helper.pathExists(previous)) {
        await asyncFs.unlink(previous)
      }
    }
    const permanentFilename = `${car._id.toString()}_registration_${nanoid()}${path.extname(safeFilename)}`
    await asyncFs.rename(tempFile, path.join(env.CDN_HOST_DOCUMENTS, permanentFilename))
    return permanentFilename
  }

  if (car.registrationDocument && path.basename(car.registrationDocument) === safeFilename) {
    return safeFilename
  }

  return null
}

/**
 * Apply an UpsertHostCarPayload onto a car document (shared by create/update).
 *
 * @param {env.Car} car
 * @param {bookcarsTypes.UpsertHostCarPayload} payload
 * @returns {void}
 */
const applyPayload = (car: env.Car, payload: bookcarsTypes.UpsertHostCarPayload) => {
  car.name = `${payload.make} ${payload.carModel} ${payload.year}`
  car.make = payload.make
  car.carModel = payload.carModel
  car.year = payload.year
  car.licensePlate = payload.licensePlate
  car.locations = payload.locations.map((id) => new mongoose.Types.ObjectId(id))
  car.dailyPrice = payload.dailyPrice
  car.deposit = payload.deposit
  car.minRentalDays = payload.minRentalDays
  car.maxRentalDays = payload.maxRentalDays
  car.type = payload.type as bookcarsTypes.CarType
  car.gearbox = payload.gearbox as bookcarsTypes.GearboxType
  car.range = payload.range
  car.aircon = payload.aircon
  car.seats = payload.seats
  car.doors = payload.doors
  car.fuelPolicy = payload.fuelPolicy as bookcarsTypes.FuelPolicy
  car.mileage = payload.mileage
  car.multimedia = payload.multimedia || []
}

/**
 * Validate an UpsertHostCarPayload.
 *
 * @param {bookcarsTypes.UpsertHostCarPayload} payload
 * @returns {string | null} error message or null when valid
 */
const validatePayload = (payload: bookcarsTypes.UpsertHostCarPayload): string | null => {
  const currentYear = new Date().getFullYear()
  if (!payload.make || !payload.carModel || !payload.licensePlate) {
    return 'Missing required fields'
  }
  if (!payload.year || payload.year < 1950 || payload.year > currentYear + 1) {
    return 'Year is not valid'
  }
  if (!payload.locations || payload.locations.length === 0 || !payload.locations.every((id) => helper.isValidObjectId(id))) {
    return 'Locations are not valid'
  }
  if (typeof payload.dailyPrice !== 'number' || payload.dailyPrice <= 0) {
    return 'Daily price is not valid'
  }
  if (typeof payload.deposit !== 'number' || payload.deposit < 0) {
    return 'Deposit is not valid'
  }
  if (payload.minRentalDays !== undefined && payload.minRentalDays < 1) {
    return 'Minimum rental days is not valid'
  }
  if (payload.maxRentalDays !== undefined && payload.maxRentalDays < 1) {
    return 'Maximum rental days is not valid'
  }
  if (payload.minRentalDays && payload.maxRentalDays && payload.minRentalDays > payload.maxRentalDays) {
    return 'Minimum rental days must not exceed maximum rental days'
  }
  if (!Object.values(bookcarsTypes.CarType).includes(payload.type as bookcarsTypes.CarType)) {
    return 'Car type is not valid'
  }
  if (!Object.values(bookcarsTypes.GearboxType).includes(payload.gearbox as bookcarsTypes.GearboxType)) {
    return 'Gearbox is not valid'
  }
  if (!Object.values(bookcarsTypes.CarRange).includes(payload.range as bookcarsTypes.CarRange)) {
    return 'Range is not valid'
  }
  if (!Object.values(bookcarsTypes.FuelPolicy).includes(payload.fuelPolicy as bookcarsTypes.FuelPolicy)) {
    return 'Fuel policy is not valid'
  }
  return null
}

/**
 * Create a host car (draft).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const createHostCar = async (req: Request, res: Response) => {
  const { body }: { body: bookcarsTypes.UpsertHostCarPayload } = req

  try {
    const host = await getApprovedHost(req)
    if (!host) {
      res.status(403).send({ message: 'Only approved hosts can list cars' })
      return
    }

    const validationError = validatePayload(body)
    if (validationError) {
      res.status(400).send(validationError)
      return
    }

    const car = new Car({
      ...HOST_CAR_DEFAULTS,
      supplier: host._id,
      hostCar: true,
      status: bookcarsTypes.CarStatus.Draft,
      available: false,
      fullyBooked: false,
      comingSoon: false,
      blockOnPay: true,
      isDateBasedPrice: false,
      dateBasedPrices: [],
    })
    applyPayload(car, body)

    if (body.image) {
      const image = await saveCarImage(body.image)
      if (!image) {
        res.status(400).send('Image not found')
        return
      }
      car.image = image
    }

    if (body.images && body.images.length > 0) {
      const images: string[] = []
      for (const img of body.images) {
        const saved = await saveCarImage(img)
        if (saved) {
          images.push(saved)
        }
      }
      car.images = images
    }

    if (body.registrationDocument) {
      const doc = await saveRegistrationDocument(car, body.registrationDocument)
      if (!doc) {
        res.status(400).send('Registration document not found')
        return
      }
      car.registrationDocument = doc
    }

    await car.save()
    res.json(car)
  } catch (err) {
    logger.error(`[hostCar.createHostCar] ${i18n.t('DB_ERROR')} ${JSON.stringify(body)}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Update a host car (own cars only).
 *
 * Structural edits are allowed at any status; the car keeps its status.
 * Approval gates going live (draft/rejected -> submit -> pendingReview -> active).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const updateHostCar = async (req: Request, res: Response) => {
  const { body }: { body: bookcarsTypes.UpsertHostCarPayload } = req

  try {
    const host = await getApprovedHost(req)
    if (!host) {
      res.status(403).send({ message: 'Only approved hosts can update cars' })
      return
    }

    if (!body._id || !helper.isValidObjectId(body._id)) {
      throw new Error('Car id is not valid')
    }

    const car = await Car.findOne({ _id: body._id, supplier: host._id, hostCar: true })
    if (!car) {
      res.sendStatus(204)
      return
    }

    const validationError = validatePayload(body)
    if (validationError) {
      res.status(400).send(validationError)
      return
    }

    applyPayload(car, body)

    if (body.image) {
      const image = await saveCarImage(body.image)
      if (!image) {
        res.status(400).send('Image not found')
        return
      }
      if (car.image && car.image !== image) {
        const oldImage = path.join(env.CDN_CARS, path.basename(car.image))
        if (await helper.pathExists(oldImage)) {
          await asyncFs.unlink(oldImage)
        }
      }
      car.image = image
    }

    if (body.images) {
      const images: string[] = []
      for (const img of body.images) {
        const saved = await saveCarImage(img)
        if (saved) {
          images.push(saved)
        }
      }
      // remove images that were dropped
      for (const oldImg of car.images || []) {
        if (!images.includes(oldImg)) {
          const oldPath = path.join(env.CDN_CARS, path.basename(oldImg))
          if (await helper.pathExists(oldPath)) {
            await asyncFs.unlink(oldPath)
          }
        }
      }
      car.images = images
    }

    if (body.registrationDocument) {
      const doc = await saveRegistrationDocument(car, body.registrationDocument)
      if (!doc) {
        res.status(400).send('Registration document not found')
        return
      }
      car.registrationDocument = doc
    }

    await car.save()
    res.json(car)
  } catch (err) {
    logger.error(`[hostCar.updateHostCar] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Submit a host car for review (draft/rejected -> pendingReview).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const submitHostCar = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const host = await getApprovedHost(req)
    if (!host) {
      res.status(403).send({ message: 'Only approved hosts can submit cars' })
      return
    }

    if (!helper.isValidObjectId(id)) {
      throw new Error('Car id is not valid')
    }

    const car = await Car.findOne({ _id: id, supplier: host._id, hostCar: true })
    if (!car) {
      res.sendStatus(204)
      return
    }

    if (!car.status || ![bookcarsTypes.CarStatus.Draft, bookcarsTypes.CarStatus.Rejected].includes(car.status)) {
      res.status(400).send('Only draft or rejected cars can be submitted for review')
      return
    }

    if (!car.registrationDocument) {
      res.status(400).send('Registration document is required')
      return
    }

    if (!car.image) {
      res.status(400).send('Main photo is required')
      return
    }

    car.status = bookcarsTypes.CarStatus.PendingReview
    car.rejectionReason = undefined
    await car.save()

    // notify admin
    const admin = !!env.ADMIN_EMAIL && (await User.findOne({ email: env.ADMIN_EMAIL, type: bookcarsTypes.UserType.Admin }))
    if (admin) {
      i18n.locale = admin.language
      const message = `${host.fullName} ${i18n.t('CAR_SUBMITTED_NOTIFICATION')} ${car.name}`
      await notify(admin, message, helper.joinURL(env.ADMIN_HOST, `host-cars?c=${car._id.toString()}`))
    }

    res.sendStatus(200)
  } catch (err) {
    logger.error(`[hostCar.submitHostCar] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Delete a host car (own cars only, only when it has no bookings).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const deleteHostCar = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const host = await getApprovedHost(req)
    if (!host) {
      res.status(403).send({ message: 'Only approved hosts can delete cars' })
      return
    }

    if (!helper.isValidObjectId(id)) {
      throw new Error('Car id is not valid')
    }

    const car = await Car.findOne({ _id: id, supplier: host._id, hostCar: true })
    if (!car) {
      res.sendStatus(204)
      return
    }

    const bookingCount = await Booking.countDocuments({ car: car._id })
    if (bookingCount > 0) {
      res.status(400).send('Car has bookings and cannot be deleted')
      return
    }

    await Car.deleteOne({ _id: car._id })
    await CarUnavailability.deleteMany({ car: car._id })

    if (car.image) {
      const image = path.join(env.CDN_CARS, path.basename(car.image))
      if (await helper.pathExists(image)) {
        await asyncFs.unlink(image)
      }
    }
    for (const img of car.images || []) {
      const image = path.join(env.CDN_CARS, path.basename(img))
      if (await helper.pathExists(image)) {
        await asyncFs.unlink(image)
      }
    }
    if (car.registrationDocument) {
      const doc = path.join(env.CDN_HOST_DOCUMENTS, path.basename(car.registrationDocument))
      if (await helper.pathExists(doc)) {
        await asyncFs.unlink(doc)
      }
    }

    res.sendStatus(200)
  } catch (err) {
    logger.error(`[hostCar.deleteHostCar] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get a host's own car.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getHostCar = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const user = await User.findById(req.user?._id)
    if (!user || !user.host) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    if (!helper.isValidObjectId(id)) {
      throw new Error('Car id is not valid')
    }

    const car = await Car.findOne({ _id: id, supplier: user._id, hostCar: true })
      .populate<{ locations: env.Location[] }>('locations')
      .lean()

    if (!car) {
      res.sendStatus(204)
      return
    }

    res.json(car)
  } catch (err) {
    logger.error(`[hostCar.getHostCar] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get a host's own cars (paginated, filterable by status).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getHostCars = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user?._id)
    if (!user || !user.host) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    const { body }: { body: bookcarsTypes.GetHostCarsBody } = req
    const page = Number.parseInt(req.params.page, 10)
    const size = Number.parseInt(req.params.size, 10)
    const keyword = escapeStringRegexp(String(req.query.s || ''))
    const options = 'i'

    const $match: Record<string, any> = {
      supplier: user._id,
      hostCar: true,
    }

    if (body.statuses && body.statuses.length > 0) {
      $match.status = { $in: body.statuses }
    }

    if (keyword) {
      $match.name = { $regex: keyword, $options: options }
    }

    const cars = await Car.aggregate(
      [
        { $match },
        { $sort: { updatedAt: -1, _id: 1 } },
        {
          $facet: {
            resultData: [{ $skip: (page - 1) * size }, { $limit: size }],
            pageInfo: [
              {
                $count: 'totalRecords',
              },
            ],
          },
        },
      ],
      { collation: { locale: env.DEFAULT_LANGUAGE, strength: 2 } },
    )

    res.json(cars)
  } catch (err) {
    logger.error(`[hostCar.getHostCars] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Upload a car image to the temp folder (host variant of car.createImage,
 * reachable from the frontend origin).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const createHostCarImage = async (req: Request, res: Response) => {
  try {
    const host = await getApprovedHost(req)
    if (!host) {
      res.status(403).send({ message: 'Only approved hosts can upload car images' })
      return
    }

    if (!req.file) {
      throw new Error('req.file not found')
    }
    if (!req.file.originalname.includes('.')) {
      throw new Error('File extension not found')
    }

    const ext = path.extname(req.file.originalname).toLowerCase()
    if (!env.allowedImageExtensions.includes(ext)) {
      res.status(400).send('Invalid image file type')
      return
    }

    const filename = `${nanoid()}${ext}`
    const filepath = path.join(env.CDN_TEMP_CARS, filename)

    await asyncFs.writeFile(filepath, req.file.buffer)
    res.json(filename)
  } catch (err) {
    logger.error(`[hostCar.createHostCarImage] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Delete a temp car image (host variant).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const deleteTempHostCarImage = async (req: Request, res: Response) => {
  const { image } = req.params

  try {
    const filepath = path.join(env.CDN_TEMP_CARS, path.basename(image))
    if (await helper.pathExists(filepath)) {
      await asyncFs.unlink(filepath)
    }
    res.sendStatus(200)
  } catch (err) {
    logger.error(`[hostCar.deleteTempHostCarImage] ${i18n.t('DB_ERROR')} ${image}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Stream a car's registration document (owning host or admin only).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getCarRegistrationDocument = async (req: Request, res: Response) => {
  const { carId } = req.params

  try {
    if (!helper.isValidObjectId(carId)) {
      throw new Error('Car id is not valid')
    }

    const car = await Car.findById(carId).lean()
    if (!car || !car.registrationDocument) {
      res.sendStatus(204)
      return
    }

    const sessionUser = req.user
    if (!sessionUser || (sessionUser.type !== bookcarsTypes.UserType.Admin && sessionUser._id !== car.supplier.toString())) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    const filepath = path.join(env.CDN_HOST_DOCUMENTS, path.basename(car.registrationDocument))
    if (!(await helper.pathExists(filepath))) {
      res.sendStatus(204)
      return
    }

    res.sendFile(path.resolve(filepath))
  } catch (err) {
    logger.error(`[hostCar.getCarRegistrationDocument] ${i18n.t('DB_ERROR')} ${carId}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Create a car unavailability period (owning host or admin).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const createCarUnavailability = async (req: Request, res: Response) => {
  const { body }: { body: bookcarsTypes.UpsertCarUnavailabilityPayload } = req

  try {
    if (!body.car || !helper.isValidObjectId(body.car) || !body.from || !body.to) {
      throw new Error('Payload is not valid')
    }

    const car = await Car.findById(body.car)
    if (!car) {
      res.sendStatus(204)
      return
    }

    const sessionUser = req.user
    if (!sessionUser || (sessionUser.type !== bookcarsTypes.UserType.Admin && sessionUser._id !== car.supplier.toString())) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    const from = new Date(body.from)
    const to = new Date(body.to)
    if (from >= to) {
      res.status(400).send('Date range is not valid')
      return
    }

    const unavailability = new CarUnavailability({
      car: car._id,
      from,
      to,
      reason: body.reason,
    })
    await unavailability.save()

    res.json(unavailability)
  } catch (err) {
    logger.error(`[hostCar.createCarUnavailability] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Delete a car unavailability period (owning host or admin).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const deleteCarUnavailability = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    if (!helper.isValidObjectId(id)) {
      throw new Error('Unavailability id is not valid')
    }

    const unavailability = await CarUnavailability.findById(id)
    if (!unavailability) {
      res.sendStatus(204)
      return
    }

    const car = await Car.findById(unavailability.car)
    const sessionUser = req.user
    if (!sessionUser || !car || (sessionUser.type !== bookcarsTypes.UserType.Admin && sessionUser._id !== car.supplier.toString())) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    await CarUnavailability.deleteOne({ _id: unavailability._id })
    res.sendStatus(200)
  } catch (err) {
    logger.error(`[hostCar.deleteCarUnavailability] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get a car's unavailability periods (owning host or admin).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getCarUnavailabilities = async (req: Request, res: Response) => {
  const { carId } = req.params

  try {
    if (!helper.isValidObjectId(carId)) {
      throw new Error('Car id is not valid')
    }

    const car = await Car.findById(carId).lean()
    if (!car) {
      res.sendStatus(204)
      return
    }

    const sessionUser = req.user
    if (!sessionUser || (sessionUser.type !== bookcarsTypes.UserType.Admin && sessionUser._id !== car.supplier.toString())) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    const unavailabilities = await CarUnavailability.find({ car: car._id }).sort({ from: 1 }).lean()
    res.json(unavailabilities)
  } catch (err) {
    logger.error(`[hostCar.getCarUnavailabilities] ${i18n.t('DB_ERROR')} ${carId}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get host cars for the admin review queue (paginated, filterable by status).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getAdminHostCars = async (req: Request, res: Response) => {
  try {
    const { body }: { body: bookcarsTypes.GetHostCarsBody } = req
    const page = Number.parseInt(req.params.page, 10)
    const size = Number.parseInt(req.params.size, 10)
    const keyword = escapeStringRegexp(String(req.query.s || ''))
    const options = 'i'

    const $match: Record<string, any> = {
      hostCar: true,
    }

    if (body.statuses && body.statuses.length > 0) {
      $match.status = { $in: body.statuses }
    }

    if (keyword) {
      $match.name = { $regex: keyword, $options: options }
    }

    const cars = await Car.aggregate(
      [
        { $match },
        {
          $lookup: {
            from: 'User',
            let: { userId: '$supplier' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$userId'] },
                },
              },
              {
                $project: { fullName: 1, email: 1, avatar: 1 },
              },
            ],
            as: 'supplier',
          },
        },
        { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: false } },
        { $sort: { updatedAt: -1, _id: 1 } },
        {
          $facet: {
            resultData: [{ $skip: (page - 1) * size }, { $limit: size }],
            pageInfo: [
              {
                $count: 'totalRecords',
              },
            ],
          },
        },
      ],
      { collation: { locale: env.DEFAULT_LANGUAGE, strength: 2 } },
    )

    res.json(cars)
  } catch (err) {
    logger.error(`[hostCar.getAdminHostCars] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Review a host car (admin): approve, reject, suspend or reactivate.
 *
 * `available` is kept in sync with the resulting status so all existing
 * search pipelines keep working unchanged.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const reviewHostCar = async (req: Request, res: Response) => {
  const { id } = req.params
  const { body }: { body: bookcarsTypes.ReviewCarPayload } = req

  try {
    if (!helper.isValidObjectId(id)) {
      throw new Error('Car id is not valid')
    }

    const car = await Car.findOne({ _id: id, hostCar: true })
    if (!car) {
      res.sendStatus(204)
      return
    }

    const { status, rejectionReason } = body

    if (![bookcarsTypes.CarStatus.Active, bookcarsTypes.CarStatus.Rejected, bookcarsTypes.CarStatus.Suspended].includes(status)) {
      res.status(400).send('Status not valid')
      return
    }

    if (status === bookcarsTypes.CarStatus.Rejected && !rejectionReason) {
      res.status(400).send('Rejection reason is required')
      return
    }

    car.status = status
    car.rejectionReason = status === bookcarsTypes.CarStatus.Rejected ? rejectionReason : undefined
    car.available = status === bookcarsTypes.CarStatus.Active
    await car.save()

    // notify the host in their language
    const host = await User.findById(car.supplier)
    if (host) {
      i18n.locale = host.language
      const hostCarsUrl = helper.joinURL(env.FRONTEND_HOST, 'host')
      if (status === bookcarsTypes.CarStatus.Active) {
        await notify(host, `${i18n.t('CAR_APPROVED_SUBJECT')} ${car.name}`, hostCarsUrl, i18n.t('CAR_APPROVED_BODY'))
      } else if (status === bookcarsTypes.CarStatus.Rejected) {
        await notify(host, `${i18n.t('CAR_REJECTED_SUBJECT')} ${car.name}`, hostCarsUrl, `${i18n.t('CAR_REJECTED_BODY')}<br><br>${rejectionReason}`)
      } else {
        await notify(host, `${i18n.t('CAR_SUSPENDED_SUBJECT')} ${car.name}`, hostCarsUrl, i18n.t('CAR_SUSPENDED_BODY'))
      }
    }

    res.sendStatus(200)
  } catch (err) {
    logger.error(`[hostCar.reviewHostCar] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}
