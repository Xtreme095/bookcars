import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../src/config/env.config'
import app from '../src/app'
import * as databaseHelper from '../src/utils/databaseHelper'
import * as testHelper from './testHelper'
import * as helper from '../src/utils/helper'
import User from '../src/models/User'
import Car from '../src/models/Car'
import CarUnavailability from '../src/models/CarUnavailability'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const IMAGE = 'avatar1.jpg'
const IMAGE_PATH = path.join(__dirname, `./img/${IMAGE}`)
const DOC = 'contract1.pdf'
const DOC_PATH = path.join(__dirname, `./contracts/${DOC}`)

let USER_ID: string
let LOCATION_ID: string
let CAR_ID: string

const carPayload = (locations: string[], extra?: Partial<bookcarsTypes.UpsertHostCarPayload>): bookcarsTypes.UpsertHostCarPayload => ({
  make: 'Fiat',
  carModel: 'Panda',
  year: 2020,
  licensePlate: 'ZG1234AB',
  locations,
  dailyPrice: 35,
  deposit: 200,
  minRentalDays: 2,
  maxRentalDays: 30,
  type: bookcarsTypes.CarType.Gasoline,
  gearbox: bookcarsTypes.GearboxType.Manual,
  range: bookcarsTypes.CarRange.Mini,
  aircon: true,
  seats: 5,
  doors: 5,
  fuelPolicy: bookcarsTypes.FuelPolicy.FullToFull,
  mileage: -1,
  multimedia: [bookcarsTypes.CarMultimedia.Bluetooth],
  ...extra,
})

//
// Connecting and initializing the database before running the test suite
//
beforeAll(async () => {
  testHelper.initializeLogger()

  await databaseHelper.connect(env.DB_URI, false, false)
  await testHelper.initialize()

  USER_ID = testHelper.getUserId()
  LOCATION_ID = await testHelper.createLocation('Zagreb EN', 'Zagreb FR')
})

//
// Closing and cleaning the database connection after running the test suite
//
afterAll(async () => {
  if (CAR_ID) {
    await Car.deleteOne({ _id: CAR_ID })
    await CarUnavailability.deleteMany({ car: CAR_ID })
  }
  await testHelper.deleteLocation(LOCATION_ID)
  await testHelper.close()
  await databaseHelper.close()
})

const makeApprovedHost = async () => {
  await User.updateOne(
    { _id: USER_ID },
    {
      $set: {
        host: {
          status: bookcarsTypes.HostStatus.Approved,
          appliedAt: new Date(),
          address: 'Ilica 1',
          city: 'Zagreb',
          postalCode: '10000',
          countryCode: 'HR',
          oib: '12345678903',
          iban: 'HR1210010051863000160',
          bankAccountHolder: 'Test Host',
          idDocFront: 'front.pdf',
          idDocBack: 'back.pdf',
        },
      },
    },
  )
}

describe('POST /api/create-host-car', () => {
  it('should create a draft car for approved hosts only', async () => {
    const token = await testHelper.signinAsUser()

    // test forbidden (not a host)
    let res = await request(app)
      .post('/api/create-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send(carPayload([LOCATION_ID]))
    expect(res.statusCode).toBe(403)

    // test forbidden (pending host)
    await makeApprovedHost()
    await User.updateOne({ _id: USER_ID }, { $set: { 'host.status': bookcarsTypes.HostStatus.Pending } })
    res = await request(app)
      .post('/api/create-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send(carPayload([LOCATION_ID]))
    expect(res.statusCode).toBe(403)

    // approved host
    await User.updateOne({ _id: USER_ID }, { $set: { 'host.status': bookcarsTypes.HostStatus.Approved } })

    // test failure (invalid year)
    res = await request(app)
      .post('/api/create-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send(carPayload([LOCATION_ID], { year: 1900 }))
    expect(res.statusCode).toBe(400)

    // test failure (invalid price)
    res = await request(app)
      .post('/api/create-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send(carPayload([LOCATION_ID], { dailyPrice: 0 }))
    expect(res.statusCode).toBe(400)

    // test failure (min > max rental days)
    res = await request(app)
      .post('/api/create-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send(carPayload([LOCATION_ID], { minRentalDays: 10, maxRentalDays: 5 }))
    expect(res.statusCode).toBe(400)

    // test failure (invalid car type)
    res = await request(app)
      .post('/api/create-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send(carPayload([LOCATION_ID], { type: 'nuclear' }))
    expect(res.statusCode).toBe(400)

    // test success
    res = await request(app)
      .post('/api/create-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send(carPayload([LOCATION_ID]))
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe(bookcarsTypes.CarStatus.Draft)
    expect(res.body.hostCar).toBeTruthy()
    expect(res.body.available).toBeFalsy()
    expect(res.body.name).toBe('Fiat Panda 2020')
    CAR_ID = res.body._id
  })
})

describe('PUT /api/update-host-car', () => {
  it('should update own host car', async () => {
    const token = await testHelper.signinAsUser()

    // test success
    let res = await request(app)
      .put('/api/update-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send({ ...carPayload([LOCATION_ID], { dailyPrice: 40 }), _id: CAR_ID })
    expect(res.statusCode).toBe(200)
    expect(res.body.dailyPrice).toBe(40)

    // test not found (unknown car)
    res = await request(app)
      .put('/api/update-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send({ ...carPayload([LOCATION_ID]), _id: testHelper.GetRandromObjectIdAsString() })
    expect(res.statusCode).toBe(204)
  })
})

describe('POST /api/host-cars/:page/:size', () => {
  it('should list own host cars', async () => {
    const token = await testHelper.signinAsUser()

    let res = await request(app)
      .post(`/api/host-cars/${testHelper.PAGE}/${testHelper.SIZE}`)
      .set(env.X_ACCESS_TOKEN, token)
      .send({})
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.length).toBe(1)

    res = await request(app)
      .post(`/api/host-cars/${testHelper.PAGE}/${testHelper.SIZE}`)
      .set(env.X_ACCESS_TOKEN, token)
      .send({ statuses: [bookcarsTypes.CarStatus.Active] })
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.length).toBe(0)
  })
})

describe('POST /api/submit-host-car/:id', () => {
  it('should require image and registration document before submission', async () => {
    const token = await testHelper.signinAsUser()

    // test failure (no image, no registration document)
    let res = await request(app)
      .post(`/api/submit-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(400)

    // upload image
    res = await request(app)
      .post('/api/create-host-car-image')
      .set(env.X_ACCESS_TOKEN, token)
      .attach('image', IMAGE_PATH)
    expect(res.statusCode).toBe(200)
    const image = res.body

    // upload registration document
    res = await request(app)
      .post(`/api/create-host-document/${bookcarsTypes.HostDocumentType.VehicleRegistration}`)
      .set(env.X_ACCESS_TOKEN, token)
      .attach('file', DOC_PATH)
    expect(res.statusCode).toBe(200)
    const registrationDocument = res.body

    // attach both via update
    res = await request(app)
      .put('/api/update-host-car')
      .set(env.X_ACCESS_TOKEN, token)
      .send({ ...carPayload([LOCATION_ID]), _id: CAR_ID, image, registrationDocument })
    expect(res.statusCode).toBe(200)
    expect(res.body.image).toBeTruthy()
    expect(res.body.registrationDocument).toBeTruthy()
    expect(await helper.pathExists(path.join(env.CDN_CARS, res.body.image))).toBeTruthy()
    expect(await helper.pathExists(path.join(env.CDN_HOST_DOCUMENTS, res.body.registrationDocument))).toBeTruthy()

    // test success
    res = await request(app)
      .post(`/api/submit-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(200)
    const car = await Car.findById(CAR_ID)
    expect(car?.status).toBe(bookcarsTypes.CarStatus.PendingReview)

    // test failure (already pending review)
    res = await request(app)
      .post(`/api/submit-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/car-registration-document/:carId', () => {
  it('should stream the registration document to the owner and admin only', async () => {
    const userToken = await testHelper.signinAsUser()
    const adminToken = await testHelper.signinAsAdmin()

    let res = await request(app)
      .get(`/api/car-registration-document/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(200)

    res = await request(app)
      .get(`/api/car-registration-document/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /api/admin-host-cars/:page/:size + POST /api/review-host-car/:id', () => {
  it('should list and review host cars (admin only)', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // test forbidden (regular user)
    let res = await request(app)
      .post(`/api/admin-host-cars/${testHelper.PAGE}/${testHelper.SIZE}`)
      .set(env.X_ACCESS_TOKEN, userToken)
      .send({})
    expect(res.statusCode).toBe(403)

    // admin queue (pending review)
    res = await request(app)
      .post(`/api/admin-host-cars/${testHelper.PAGE}/${testHelper.SIZE}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ statuses: [bookcarsTypes.CarStatus.PendingReview] })
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.map((c: bookcarsTypes.Car) => c._id)).toContain(CAR_ID)

    // test failure (rejection without reason)
    res = await request(app)
      .post(`/api/review-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.CarStatus.Rejected })
    expect(res.statusCode).toBe(400)

    // reject with reason
    res = await request(app)
      .post(`/api/review-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.CarStatus.Rejected, rejectionReason: 'Blurry registration document' })
    expect(res.statusCode).toBe(200)
    let car = await Car.findById(CAR_ID)
    expect(car?.status).toBe(bookcarsTypes.CarStatus.Rejected)
    expect(car?.available).toBeFalsy()

    // resubmit after rejection
    res = await request(app)
      .post(`/api/submit-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(200)

    // approve -> active + available
    res = await request(app)
      .post(`/api/review-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.CarStatus.Active })
    expect(res.statusCode).toBe(200)
    car = await Car.findById(CAR_ID)
    expect(car?.status).toBe(bookcarsTypes.CarStatus.Active)
    expect(car?.available).toBeTruthy()
    expect(car?.rejectionReason).toBeFalsy()

    // suspend
    res = await request(app)
      .post(`/api/review-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.CarStatus.Suspended })
    expect(res.statusCode).toBe(200)
    car = await Car.findById(CAR_ID)
    expect(car?.available).toBeFalsy()

    // reactivate
    res = await request(app)
      .post(`/api/review-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.CarStatus.Active })
    expect(res.statusCode).toBe(200)
  })
})

describe('car unavailability', () => {
  it('should create, list and delete unavailability periods (owner or admin)', async () => {
    const userToken = await testHelper.signinAsUser()
    const adminToken = await testHelper.signinAsAdmin()

    // test failure (invalid range)
    let res = await request(app)
      .post('/api/create-car-unavailability')
      .set(env.X_ACCESS_TOKEN, userToken)
      .send({ car: CAR_ID, from: new Date(2026, 8, 10), to: new Date(2026, 8, 1) })
    expect(res.statusCode).toBe(400)

    // test success (owner)
    res = await request(app)
      .post('/api/create-car-unavailability')
      .set(env.X_ACCESS_TOKEN, userToken)
      .send({ car: CAR_ID, from: new Date(2026, 8, 1), to: new Date(2026, 8, 10), reason: 'Family trip' })
    expect(res.statusCode).toBe(200)
    const unavailabilityId = res.body._id

    // list (admin)
    res = await request(app)
      .get(`/api/car-unavailabilities/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)
    expect(res.body.length).toBe(1)

    // delete (owner)
    res = await request(app)
      .post(`/api/delete-car-unavailability/${unavailabilityId}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(200)
    expect(await CarUnavailability.countDocuments({ car: CAR_ID })).toBe(0)
  })
})

describe('POST /api/checkout (P2P guards)', () => {
  it('should reject bookings violating car constraints', async () => {
    // car is active; min 2 days, max 30 days
    const from = new Date(2026, 9, 1)
    const oneDayLater = new Date(2026, 9, 2)
    const validTo = new Date(2026, 9, 5)

    const bookingBase = {
      supplier: USER_ID,
      car: CAR_ID,
      driver: testHelper.getUserId(),
      pickupLocation: LOCATION_ID,
      dropOffLocation: LOCATION_ID,
      status: bookcarsTypes.BookingStatus.Pending,
      price: 140,
    }

    // test failure (below minimum rental days)
    let res = await request(app)
      .post('/api/checkout')
      .send({ booking: { ...bookingBase, from, to: oneDayLater }, payLater: true })
    expect(res.statusCode).toBe(400)

    // test failure (unavailability overlap)
    await new CarUnavailability({ car: CAR_ID, from: new Date(2026, 9, 3), to: new Date(2026, 9, 4) }).save()
    res = await request(app)
      .post('/api/checkout')
      .send({ booking: { ...bookingBase, from, to: validTo }, payLater: true })
    expect(res.statusCode).toBe(400)
    await CarUnavailability.deleteMany({ car: CAR_ID })

    // test failure (car not available)
    await Car.updateOne({ _id: CAR_ID }, { $set: { available: false } })
    res = await request(app)
      .post('/api/checkout')
      .send({ booking: { ...bookingBase, from, to: validTo }, payLater: true })
    expect(res.statusCode).toBe(400)
    await Car.updateOne({ _id: CAR_ID }, { $set: { available: true } })
  })
})

describe('POST /api/delete-host-car/:id', () => {
  it('should delete own host car without bookings', async () => {
    const token = await testHelper.signinAsUser()

    const res = await request(app)
      .post(`/api/delete-host-car/${CAR_ID}`)
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(200)
    expect(await Car.findById(CAR_ID)).toBeNull()
    CAR_ID = ''
  })
})
