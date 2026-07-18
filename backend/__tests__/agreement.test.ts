import 'dotenv/config'
import path from 'node:path'
import request from 'supertest'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../src/config/env.config'
import app from '../src/app'
import * as databaseHelper from '../src/utils/databaseHelper'
import * as testHelper from './testHelper'
import * as helper from '../src/utils/helper'
import * as agreementHelper from '../src/utils/agreementHelper'
import Booking from '../src/models/Booking'
import Car from '../src/models/Car'

let USER_ID: string
let LOCATION_ID: string
let CAR_ID: string
let BOOKING_ID: string

//
// Connecting and initializing the database before running the test suite
//
beforeAll(async () => {
  testHelper.initializeLogger()

  await databaseHelper.connect(env.DB_URI, false, false)
  await testHelper.initialize()

  USER_ID = testHelper.getUserId()
  LOCATION_ID = await testHelper.createLocation('Agreement Loc EN', 'Agreement Loc FR')

  const car = new Car({
    name: 'Škoda Octavia 2021',
    supplier: USER_ID,
    hostCar: true,
    status: bookcarsTypes.CarStatus.Active,
    minimumAge: 21,
    locations: [LOCATION_ID],
    dailyPrice: 55,
    deposit: 300,
    available: true,
    type: bookcarsTypes.CarType.Diesel,
    gearbox: bookcarsTypes.GearboxType.Automatic,
    aircon: true,
    seats: 5,
    doors: 5,
    fuelPolicy: bookcarsTypes.FuelPolicy.FullToFull,
    mileage: -1,
    cancellation: 0,
    amendments: -1,
    theftProtection: -1,
    collisionDamageWaiver: -1,
    fullInsurance: -1,
    additionalDriver: -1,
    range: bookcarsTypes.CarRange.Midi,
    licensePlate: 'ZG9876CD',
  })
  await car.save()
  CAR_ID = car._id.toString()

  const booking = new Booking({
    supplier: USER_ID,
    car: CAR_ID,
    driver: USER_ID,
    pickupLocation: LOCATION_ID,
    dropOffLocation: LOCATION_ID,
    from: new Date(2026, 9, 5, 10, 0),
    to: new Date(2026, 9, 10, 10, 0),
    status: bookcarsTypes.BookingStatus.Paid,
    expireAt: undefined,
    price: 275,
  })
  await booking.save()
  BOOKING_ID = booking._id.toString()
})

//
// Closing and cleaning the database connection after running the test suite
//
afterAll(async () => {
  const booking = await Booking.findById(BOOKING_ID)
  if (booking?.agreement?.file) {
    const file = path.join(env.CDN_AGREEMENTS, booking.agreement.file)
    if (await helper.pathExists(file)) {
      const asyncFs = await import('node:fs/promises')
      await asyncFs.unlink(file)
    }
  }
  await Booking.deleteOne({ _id: BOOKING_ID })
  await Car.deleteOne({ _id: CAR_ID })
  await testHelper.deleteLocation(LOCATION_ID)
  await testHelper.close()
  await databaseHelper.close()
})

describe('agreementHelper.ensureAgreement', () => {
  it('should generate an idempotent rental agreement PDF', async () => {
    const agreement = await agreementHelper.ensureAgreement(BOOKING_ID)
    expect(agreement).toBeTruthy()
    expect(agreement!.file).toBeTruthy()
    expect(agreement!.language).toBe('en')
    expect(await helper.pathExists(path.join(env.CDN_AGREEMENTS, agreement!.file))).toBeTruthy()

    // idempotent — same file on second call
    const again = await agreementHelper.ensureAgreement(BOOKING_ID)
    expect(again!.file).toBe(agreement!.file)

    // force regenerates a new file
    const regenerated = await agreementHelper.ensureAgreement(BOOKING_ID, true)
    expect(regenerated!.file).not.toBe(agreement!.file)
    expect(await helper.pathExists(path.join(env.CDN_AGREEMENTS, regenerated!.file))).toBeTruthy()
    expect(await helper.pathExists(path.join(env.CDN_AGREEMENTS, agreement!.file))).toBeFalsy()
  })
})

describe('GET /api/booking-agreement/:id', () => {
  it('should stream the agreement to admin and renter only', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // renter (also booking supplier in this fixture)
    let res = await request(app)
      .get(`/api/booking-agreement/${BOOKING_ID}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('pdf')

    // admin
    res = await request(app)
      .get(`/api/booking-agreement/${BOOKING_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)

    // unknown booking
    res = await request(app)
      .get(`/api/booking-agreement/${testHelper.GetRandromObjectIdAsString()}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(204)

    // no token
    res = await request(app)
      .get(`/api/booking-agreement/${BOOKING_ID}`)
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/regenerate-agreement/:id', () => {
  it('should regenerate the agreement (admin only)', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // forbidden (regular user)
    let res = await request(app)
      .post(`/api/regenerate-agreement/${BOOKING_ID}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(403)

    // admin
    const before = (await Booking.findById(BOOKING_ID))!.agreement!.file
    res = await request(app)
      .post(`/api/regenerate-agreement/${BOOKING_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)
    expect(res.body.file).toBeTruthy()
    expect(res.body.file).not.toBe(before)
  })
})
