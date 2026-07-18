import 'dotenv/config'
import path from 'node:path'
import asyncFs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { nanoid } from 'nanoid'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../src/config/env.config'
import app from '../src/app'
import * as databaseHelper from '../src/utils/databaseHelper'
import * as testHelper from './testHelper'
import * as helper from '../src/utils/helper'
import User from '../src/models/User'
import Car from '../src/models/Car'
import Booking from '../src/models/Booking'
import CarUnavailability from '../src/models/CarUnavailability'
import CommissionTransaction from '../src/models/CommissionTransaction'
import Payout from '../src/models/Payout'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DOC_PATH = path.join(__dirname, './contracts/contract1.pdf')

let HOST_ID: string
let RENTER_ID: string
let SUPPLIER_ID: string
let LOCATION_ID: string
let HOST_CAR_ID: string

// files that must be removed when the host account is deleted
let hostIdFront: string
let hostIdBack: string
let carImage: string
let registrationDocument: string
let hostAgreement: string
let statementFile: string
// files that must be removed when the renter account is deleted
let renterLicenseFront: string
let renterAgreement: string

const seedFile = async (dir: string, filename: string) => {
  await asyncFs.copyFile(DOC_PATH, path.join(dir, filename))
  return filename
}

const carPayload = (supplier: string) => ({
  name: 'Renault Twingo III',
  supplier,
  minimumAge: 21,
  locations: [LOCATION_ID],
  dailyPrice: 40,
  deposit: 200,
  available: true,
  type: bookcarsTypes.CarType.Gasoline,
  gearbox: bookcarsTypes.GearboxType.Manual,
  aircon: true,
  seats: 4,
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

const bookingPayload = (supplier: string, car: string, driver: string, agreementFile: string) => ({
  supplier,
  car,
  driver,
  pickupLocation: LOCATION_ID,
  dropOffLocation: LOCATION_ID,
  from: new Date(2098, 0, 1),
  to: new Date(2098, 0, 4),
  status: bookcarsTypes.BookingStatus.Paid,
  price: 120,
  cancellation: false,
  amendments: false,
  theftProtection: false,
  collisionDamageWaiver: false,
  fullInsurance: false,
  additionalDriver: false,
  agreement: {
    file: agreementFile,
    language: 'en',
    generatedAt: new Date(),
  },
})

//
// Connecting and initializing the database before running the test suite
//
beforeAll(async () => {
  testHelper.initializeLogger()

  await databaseHelper.connect(env.DB_URI, false, false)
  await testHelper.initialize()

  LOCATION_ID = await testHelper.createLocation('P2P Delete Location EN', 'P2P Delete Location FR')

  // host with identity documents, a car, a booking, a ledger entry and a payout
  hostIdFront = await seedFile(env.CDN_HOST_DOCUMENTS, `delete_host_id_front_${nanoid()}.pdf`)
  hostIdBack = await seedFile(env.CDN_HOST_DOCUMENTS, `delete_host_id_back_${nanoid()}.pdf`)
  const host = new User({
    fullName: 'Delete Host',
    email: testHelper.GetRandomEmail(),
    language: testHelper.LANGUAGE,
    type: bookcarsTypes.UserType.User,
    active: true,
    verified: true,
    host: {
      status: bookcarsTypes.HostStatus.Approved,
      idDocFront: hostIdFront,
      idDocBack: hostIdBack,
    },
  })
  await host.save()
  HOST_ID = host._id.toString()

  // renter with verification documents
  renterLicenseFront = await seedFile(env.CDN_HOST_DOCUMENTS, `delete_renter_license_${nanoid()}.pdf`)
  const renter = new User({
    fullName: 'Delete Renter',
    email: testHelper.GetRandomEmail(),
    language: testHelper.LANGUAGE,
    type: bookcarsTypes.UserType.User,
    active: true,
    verified: true,
    documents: {
      licenseFront: renterLicenseFront,
    },
    verification: {
      status: bookcarsTypes.VerificationStatus.Approved,
      method: 'manual',
      submittedAt: new Date(),
    },
  })
  await renter.save()
  RENTER_ID = renter._id.toString()

  // classic supplier for the renter's second booking
  const supplierName = testHelper.getSupplierName()
  SUPPLIER_ID = await testHelper.createSupplier(`${supplierName}@test.bookcars.ma`, supplierName)

  // host car with gallery image and registration document
  carImage = await seedFile(env.CDN_CARS, `delete_car_image_${nanoid()}.pdf`)
  registrationDocument = await seedFile(env.CDN_HOST_DOCUMENTS, `delete_car_registration_${nanoid()}.pdf`)
  const car = new Car({
    ...carPayload(HOST_ID),
    hostCar: true,
    status: bookcarsTypes.CarStatus.Active,
    images: [carImage],
    registrationDocument,
  })
  await car.save()
  HOST_CAR_ID = car._id.toString()

  const unavailability = new CarUnavailability({
    car: HOST_CAR_ID,
    from: new Date(2098, 5, 1),
    to: new Date(2098, 5, 10),
  })
  await unavailability.save()

  // host booking (renter is the driver) with a rental agreement PDF
  hostAgreement = await seedFile(env.CDN_AGREEMENTS, `delete_host_agreement_${nanoid()}.pdf`)
  const hostBooking = new Booking(bookingPayload(HOST_ID, HOST_CAR_ID, RENTER_ID, hostAgreement))
  await hostBooking.save()

  const transaction = new CommissionTransaction({
    booking: hostBooking._id,
    supplier: HOST_ID,
    totalBookingAmount: 120,
    supplierEarnings: 78,
    platformCommission: 42,
    commissionType: 'percentage',
    commissionValue: 35,
    paymentGatewayFee: 3.83,
    netRevenue: 38.17,
    pdvRate: 25,
    pdvAmount: 10.5,
    payoutStatus: 'pending',
    hostCar: true,
  })
  await transaction.save()

  statementFile = await seedFile(env.CDN_STATEMENTS, `delete_statement_${nanoid()}.pdf`)
  const payout = new Payout({
    host: HOST_ID,
    year: 2098,
    month: 1,
    statementFile,
  })
  await payout.save()

  // renter booking with a classic supplier and its own agreement PDF
  renterAgreement = await seedFile(env.CDN_AGREEMENTS, `delete_renter_agreement_${nanoid()}.pdf`)
  const supplierCar = new Car(carPayload(SUPPLIER_ID))
  await supplierCar.save()
  const renterBooking = new Booking(bookingPayload(SUPPLIER_ID, supplierCar._id.toString(), RENTER_ID, renterAgreement))
  await renterBooking.save()
})

//
// Closing and cleaning the database connection after running the test suite
//
afterAll(async () => {
  // defensive cleanup in case assertions failed mid-way
  await Booking.deleteMany({ supplier: { $in: [HOST_ID, SUPPLIER_ID] } })
  await Car.deleteMany({ supplier: { $in: [HOST_ID, SUPPLIER_ID] } })
  await CarUnavailability.deleteMany({ car: HOST_CAR_ID })
  await CommissionTransaction.deleteMany({ supplier: HOST_ID })
  await Payout.deleteMany({ host: HOST_ID })
  await User.deleteMany({ _id: { $in: [HOST_ID, RENTER_ID] } })
  for (const [dir, file] of [
    [env.CDN_HOST_DOCUMENTS, hostIdFront],
    [env.CDN_HOST_DOCUMENTS, hostIdBack],
    [env.CDN_HOST_DOCUMENTS, registrationDocument],
    [env.CDN_HOST_DOCUMENTS, renterLicenseFront],
    [env.CDN_CARS, carImage],
    [env.CDN_AGREEMENTS, hostAgreement],
    [env.CDN_AGREEMENTS, renterAgreement],
    [env.CDN_STATEMENTS, statementFile],
  ]) {
    const filepath = path.join(dir, file)
    if (await helper.pathExists(filepath)) {
      await asyncFs.unlink(filepath)
    }
  }
  await testHelper.deleteSupplier(SUPPLIER_ID)
  await testHelper.deleteLocation(LOCATION_ID)

  await testHelper.close()
  await databaseHelper.close()
})

describe('POST /api/delete-users (host)', () => {
  it('should delete a host with cars, bookings, ledger, payouts and documents', async () => {
    const adminToken = await testHelper.signinAsAdmin()

    const res = await request(app)
      .post('/api/delete-users')
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send([HOST_ID])
    expect(res.statusCode).toBe(200)

    expect(await User.findById(HOST_ID)).toBeNull()
    expect(await Car.findById(HOST_CAR_ID)).toBeNull()
    expect(await CarUnavailability.findOne({ car: HOST_CAR_ID })).toBeNull()
    expect(await Booking.findOne({ supplier: HOST_ID })).toBeNull()
    expect(await CommissionTransaction.findOne({ supplier: HOST_ID })).toBeNull()
    expect(await Payout.findOne({ host: HOST_ID })).toBeNull()

    // all host-related files must be gone
    expect(await helper.pathExists(path.join(env.CDN_HOST_DOCUMENTS, hostIdFront))).toBeFalsy()
    expect(await helper.pathExists(path.join(env.CDN_HOST_DOCUMENTS, hostIdBack))).toBeFalsy()
    expect(await helper.pathExists(path.join(env.CDN_HOST_DOCUMENTS, registrationDocument))).toBeFalsy()
    expect(await helper.pathExists(path.join(env.CDN_CARS, carImage))).toBeFalsy()
    expect(await helper.pathExists(path.join(env.CDN_AGREEMENTS, hostAgreement))).toBeFalsy()
    expect(await helper.pathExists(path.join(env.CDN_STATEMENTS, statementFile))).toBeFalsy()

    // the renter and their booking with the classic supplier are untouched
    expect(await User.findById(RENTER_ID)).not.toBeNull()
    expect(await Booking.findOne({ driver: RENTER_ID })).not.toBeNull()
    expect(await helper.pathExists(path.join(env.CDN_AGREEMENTS, renterAgreement))).toBeTruthy()
  })
})

describe('POST /api/delete-users (renter)', () => {
  it('should delete a renter with verification documents and agreements', async () => {
    const adminToken = await testHelper.signinAsAdmin()

    const res = await request(app)
      .post('/api/delete-users')
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send([RENTER_ID])
    expect(res.statusCode).toBe(200)

    expect(await User.findById(RENTER_ID)).toBeNull()
    expect(await Booking.findOne({ driver: RENTER_ID })).toBeNull()
    expect(await helper.pathExists(path.join(env.CDN_HOST_DOCUMENTS, renterLicenseFront))).toBeFalsy()
    expect(await helper.pathExists(path.join(env.CDN_AGREEMENTS, renterAgreement))).toBeFalsy()
  })
})
