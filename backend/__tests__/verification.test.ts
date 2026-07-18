import 'dotenv/config'
import path from 'node:path'
import asyncFs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../src/config/env.config'
import app from '../src/app'
import * as databaseHelper from '../src/utils/databaseHelper'
import * as testHelper from './testHelper'
import * as helper from '../src/utils/helper'
import * as authHelper from '../src/utils/authHelper'
import * as priceHelper from '../src/utils/priceHelper'
import User from '../src/models/User'
import Car from '../src/models/Car'
import Booking from '../src/models/Booking'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DOC1 = 'contract1.pdf'
const DOC1_PATH = path.join(__dirname, `./contracts/${DOC1}`)

let USER_ID: string
let HOST_ID: string
let LOCATION_ID: string
let HOST_CAR_ID: string

const uploadDocument = async (token: string, type: bookcarsTypes.RenterDocumentType) => {
  const res = await request(app)
    .post(`/api/create-verification-document/${type}`)
    .set(env.X_ACCESS_TOKEN, token)
    .attach('file', DOC1_PATH)
  expect(res.statusCode).toBe(200)
  return res.body as string
}

const submitDocuments = async (token: string) => {
  const payload: bookcarsTypes.SubmitVerificationPayload = {
    licenseFront: await uploadDocument(token, bookcarsTypes.RenterDocumentType.LicenseFront),
    licenseBack: await uploadDocument(token, bookcarsTypes.RenterDocumentType.LicenseBack),
    idFront: await uploadDocument(token, bookcarsTypes.RenterDocumentType.IdFront),
  }
  return request(app)
    .post('/api/submit-verification')
    .set(env.X_ACCESS_TOKEN, token)
    .send(payload)
}

//
// Connecting and initializing the database before running the test suite
//
beforeAll(async () => {
  testHelper.initializeLogger()

  await databaseHelper.connect(env.DB_URI, false, false)
  await testHelper.initialize()

  USER_ID = testHelper.getUserId()

  // host user owning a P2P car (checkout gate tests)
  const host = new User({
    fullName: 'Verification Host',
    email: testHelper.GetRandomEmail(),
    language: testHelper.LANGUAGE,
    type: bookcarsTypes.UserType.User,
    active: true,
    verified: true,
    host: {
      status: bookcarsTypes.HostStatus.Approved,
    },
  })
  await host.save()
  HOST_ID = host._id.toString()

  LOCATION_ID = await testHelper.createLocation('Verification Location 1 EN', 'Verification Location 1 FR')

  const car = new Car({
    name: 'Renault Clio V',
    supplier: HOST_ID,
    minimumAge: 21,
    locations: [LOCATION_ID],
    dailyPrice: 50,
    deposit: 300,
    available: true,
    hostCar: true,
    status: bookcarsTypes.CarStatus.Active,
    type: bookcarsTypes.CarType.Gasoline,
    gearbox: bookcarsTypes.GearboxType.Manual,
    aircon: true,
    seats: 5,
    doors: 4,
    fuelPolicy: bookcarsTypes.FuelPolicy.FreeTank,
    mileage: -1,
    cancellation: 0,
    amendments: -1,
    theftProtection: -1,
    collisionDamageWaiver: -1,
    fullInsurance: -1,
    additionalDriver: -1,
    range: bookcarsTypes.CarRange.Mini,
    multimedia: [],
  })
  await car.save()
  HOST_CAR_ID = car._id.toString()
})

//
// Closing and cleaning the database connection after running the test suite
//
afterAll(async () => {
  // cleanup renter documents, legacy license and verification state
  const user = await User.findById(USER_ID)
  if (user) {
    for (const docType of Object.values(bookcarsTypes.RenterDocumentType)) {
      const filename = user.documents?.[docType]
      if (filename) {
        const file = path.join(env.CDN_HOST_DOCUMENTS, filename)
        if (await helper.pathExists(file)) {
          await asyncFs.unlink(file)
        }
      }
    }
    if (user.license) {
      const license = path.join(env.CDN_LICENSES, user.license)
      if (await helper.pathExists(license)) {
        await asyncFs.unlink(license)
      }
    }
    user.documents = undefined
    user.verification = undefined
    user.license = undefined
    await user.save()
  }

  const bookings = await Booking.find({ car: HOST_CAR_ID })
  for (const booking of bookings) {
    if (booking.agreement?.file) {
      const agreement = path.join(env.CDN_AGREEMENTS, booking.agreement.file)
      if (await helper.pathExists(agreement)) {
        await asyncFs.unlink(agreement)
      }
    }
  }
  await Booking.deleteMany({ car: HOST_CAR_ID })
  await Car.deleteOne({ _id: HOST_CAR_ID })
  await User.deleteOne({ _id: HOST_ID })
  await testHelper.deleteLocation(LOCATION_ID)

  await testHelper.close()
  await databaseHelper.close()
})

describe('POST /api/create-verification-document/:type', () => {
  it('should upload and delete a temp verification document', async () => {
    const token = await testHelper.signinAsUser()

    // test success
    const filename = await uploadDocument(token, bookcarsTypes.RenterDocumentType.LicenseFront)
    expect(await helper.pathExists(path.join(env.CDN_TEMP_HOST_DOCUMENTS, filename))).toBeTruthy()

    // cleanup temp doc
    let res = await request(app)
      .post(`/api/delete-temp-verification-document/${bookcarsTypes.RenterDocumentType.LicenseFront}/${filename}`)
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(200)
    expect(await helper.pathExists(path.join(env.CDN_TEMP_HOST_DOCUMENTS, filename))).toBeFalsy()

    // test failure (invalid document type)
    res = await request(app)
      .post('/api/create-verification-document/unknown')
      .set(env.X_ACCESS_TOKEN, token)
      .attach('file', DOC1_PATH)
    expect(res.statusCode).toBe(400)

    // test failure (no file)
    res = await request(app)
      .post(`/api/create-verification-document/${bookcarsTypes.RenterDocumentType.LicenseFront}`)
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(400)

    // test failure (no token)
    res = await request(app)
      .post(`/api/create-verification-document/${bookcarsTypes.RenterDocumentType.LicenseFront}`)
      .attach('file', DOC1_PATH)
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/submit-verification', () => {
  it('should submit verification documents', async () => {
    const token = await testHelper.signinAsUser()

    // test failure (missing required documents)
    let res = await request(app)
      .post('/api/submit-verification')
      .set(env.X_ACCESS_TOKEN, token)
      .send({ licenseFront: 'file.pdf' })
    expect(res.statusCode).toBe(400)

    // test success
    res = await submitDocuments(token)
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe(bookcarsTypes.VerificationStatus.Pending)

    const user = await User.findById(USER_ID)
    expect(user?.verification?.status).toBe(bookcarsTypes.VerificationStatus.Pending)
    expect(user?.verification?.method).toBe('manual')
    expect(user?.documents?.licenseFront).toBeTruthy()
    expect(user?.documents?.licenseBack).toBeTruthy()
    expect(user?.documents?.idFront).toBeTruthy()
    // temp documents must have been moved to the permanent private folder
    expect(await helper.pathExists(path.join(env.CDN_HOST_DOCUMENTS, user!.documents!.licenseFront!))).toBeTruthy()

    // test failure (already pending)
    res = await submitDocuments(token)
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/verification', () => {
  it('should return the session user verification state', async () => {
    const token = await testHelper.signinAsUser()

    // test success
    const res = await request(app)
      .get('/api/verification')
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(200)
    expect(res.body.verification.status).toBe(bookcarsTypes.VerificationStatus.Pending)
    expect(res.body.documents.licenseFront).toBeTruthy()
  })
})

describe('GET /api/verification-document/:userId/:type', () => {
  it('should stream verification documents to the owner and admin only', async () => {
    const userToken = await testHelper.signinAsUser()
    const adminToken = await testHelper.signinAsAdmin()

    // owner
    let res = await request(app)
      .get(`/api/verification-document/${USER_ID}/${bookcarsTypes.RenterDocumentType.LicenseFront}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(200)

    // admin
    res = await request(app)
      .get(`/api/verification-document/${USER_ID}/${bookcarsTypes.RenterDocumentType.IdFront}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)

    // another user (forbidden)
    const otherEmail = `verification-other.${testHelper.GetRandromObjectIdAsString()}@test.bookcars.ma`
    const passwordHash = await authHelper.hashPassword(testHelper.PASSWORD)
    const otherUser = new User({
      email: otherEmail,
      fullName: 'other user',
      language: 'en',
      password: passwordHash,
      type: bookcarsTypes.UserType.User,
      active: true,
      verified: true,
    })
    await otherUser.save()
    res = await request(app)
      .post(`/api/sign-in/${bookcarsTypes.AppType.Frontend}`)
      .send({ email: otherEmail, password: testHelper.PASSWORD })
    expect(res.statusCode).toBe(200)
    const cookies = res.headers['set-cookie'] as unknown as string[]
    const otherToken = testHelper.getToken(cookies[1])
    res = await request(app)
      .get(`/api/verification-document/${USER_ID}/${bookcarsTypes.RenterDocumentType.LicenseFront}`)
      .set(env.X_ACCESS_TOKEN, otherToken)
    expect(res.statusCode).toBe(403)
    await User.deleteOne({ _id: otherUser._id })

    // invalid document type
    res = await request(app)
      .get(`/api/verification-document/${USER_ID}/unknown`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(400)

    // missing document (no verification submitted)
    res = await request(app)
      .get(`/api/verification-document/${HOST_ID}/${bookcarsTypes.RenterDocumentType.LicenseFront}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(204)
  })
})

describe('POST /api/verifications/:page/:size', () => {
  it('should return verifications to admin only', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // test success (keyword narrows down to the test user)
    let res = await request(app)
      .post(`/api/verifications/1/10?s=${encodeURIComponent(testHelper.USER_EMAIL)}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({})
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.length).toBe(1)
    expect(res.body[0].resultData[0].verification.status).toBe(bookcarsTypes.VerificationStatus.Pending)

    // test success (status filter)
    res = await request(app)
      .post(`/api/verifications/1/10?s=${encodeURIComponent(testHelper.USER_EMAIL)}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ statuses: [bookcarsTypes.VerificationStatus.Pending] })
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.length).toBe(1)

    res = await request(app)
      .post(`/api/verifications/1/10?s=${encodeURIComponent(testHelper.USER_EMAIL)}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ statuses: [bookcarsTypes.VerificationStatus.Approved] })
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.length).toBe(0)

    // test forbidden (regular user)
    res = await request(app)
      .post('/api/verifications/1/10')
      .set(env.X_ACCESS_TOKEN, userToken)
      .send({})
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/review-verification/:id', () => {
  it('should reject and approve verifications (admin only)', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // test forbidden (regular user)
    let res = await request(app)
      .post(`/api/review-verification/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, userToken)
      .send({ status: bookcarsTypes.VerificationStatus.Approved })
    expect(res.statusCode).toBe(403)

    // test failure (invalid status)
    res = await request(app)
      .post(`/api/review-verification/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.VerificationStatus.Pending })
    expect(res.statusCode).toBe(400)

    // test failure (rejection without reason)
    res = await request(app)
      .post(`/api/review-verification/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.VerificationStatus.Rejected })
    expect(res.statusCode).toBe(400)

    // test not found (user without verification)
    res = await request(app)
      .post(`/api/review-verification/${testHelper.GetRandromObjectIdAsString()}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.VerificationStatus.Approved })
    expect(res.statusCode).toBe(204)

    // reject
    res = await request(app)
      .post(`/api/review-verification/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.VerificationStatus.Rejected, rejectionReason: 'Documents not readable' })
    expect(res.statusCode).toBe(200)
    let user = await User.findById(USER_ID)
    expect(user?.verification?.status).toBe(bookcarsTypes.VerificationStatus.Rejected)
    expect(user?.verification?.rejectionReason).toBe('Documents not readable')

    // re-submit after rejection
    res = await submitDocuments(userToken)
    expect(res.statusCode).toBe(200)
    user = await User.findById(USER_ID)
    expect(user?.verification?.status).toBe(bookcarsTypes.VerificationStatus.Pending)

    // approve
    res = await request(app)
      .post(`/api/review-verification/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.VerificationStatus.Approved })
    expect(res.statusCode).toBe(200)
    user = await User.findById(USER_ID)
    expect(user?.verification?.status).toBe(bookcarsTypes.VerificationStatus.Approved)
    expect(user?.verification?.rejectionReason).toBeFalsy()
    // legacy license copy for per-supplier licenseRequired checks
    expect(user?.license).toBeTruthy()
    expect(await helper.pathExists(path.join(env.CDN_LICENSES, user!.license!))).toBeTruthy()
  })
})

describe('POST /api/checkout (host car verification gate)', () => {
  it('should require an approved verification to book a host car', async () => {
    const from = new Date()
    from.setDate(from.getDate() + 10)
    from.setHours(10, 0, 0, 0)
    const to = new Date(from)
    to.setDate(to.getDate() + 3)

    const car = await Car.findById(HOST_CAR_ID).lean()
    const options = {
      cancellation: false,
      amendments: false,
      theftProtection: false,
      collisionDamageWaiver: false,
      fullInsurance: false,
      additionalDriver: false,
    }
    const price = priceHelper.calculateTotalPrice(car as unknown as env.Car, [], from, to, 0, options)

    const bookingPayload = {
      supplier: HOST_ID,
      car: HOST_CAR_ID,
      driver: USER_ID,
      pickupLocation: LOCATION_ID,
      dropOffLocation: LOCATION_ID,
      from,
      to,
      status: bookcarsTypes.BookingStatus.Pending,
      ...options,
      price,
    }

    // test failure (anonymous checkout with inline driver payload)
    let res = await request(app)
      .post('/api/checkout')
      .send({
        driver: {
          fullName: 'Anonymous Renter',
          email: testHelper.GetRandomEmail(),
          language: testHelper.LANGUAGE,
        },
        booking: { ...bookingPayload, driver: undefined },
        payLater: true,
      })
    expect(res.statusCode).toBe(400)

    // test failure (registered but unverified renter)
    const user = await User.findById(USER_ID)
    user!.verification = undefined
    await user!.save()
    res = await request(app)
      .post('/api/checkout')
      .send({ booking: bookingPayload, payLater: true })
    expect(res.statusCode).toBe(400)

    // test success (approved renter)
    user!.verification = {
      status: bookcarsTypes.VerificationStatus.Approved,
      method: 'manual',
      submittedAt: new Date(),
    }
    await user!.save()
    res = await request(app)
      .post('/api/checkout')
      .send({ booking: bookingPayload, payLater: true })
    expect(res.statusCode).toBe(200)

    const booking = await Booking.findOne({ car: HOST_CAR_ID, driver: USER_ID })
    expect(booking).not.toBeNull()
    await testHelper.deleteNotifications(booking!._id.toString())
  })
})
