import 'dotenv/config'
import request from 'supertest'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../src/config/env.config'
import app from '../src/app'
import * as databaseHelper from '../src/utils/databaseHelper'
import * as testHelper from './testHelper'
import * as ledgerHelper from '../src/utils/ledgerHelper'
import User from '../src/models/User'
import Car from '../src/models/Car'
import Booking from '../src/models/Booking'
import CommissionTransaction from '../src/models/CommissionTransaction'
import Payout from '../src/models/Payout'
import Setting from '../src/models/Setting'

let USER_ID: string
let LOCATION_ID: string
let CAR_ID: string
let BOOKING_ID: string

const YEAR = 2026
const MONTH = 8

//
// Connecting and initializing the database before running the test suite
//
beforeAll(async () => {
  testHelper.initializeLogger()

  await databaseHelper.connect(env.DB_URI, false, false)
  await testHelper.initialize()

  USER_ID = testHelper.getUserId()
  LOCATION_ID = await testHelper.createLocation('Payout Loc EN', 'Payout Loc FR')

  // make the test user an approved host with 30% commission and a 500€ guaranteed minimum
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
          commissionPct: 30,
          guaranteedMonthlyMinimum: 500,
          contractNumber: 'HOST-TEST-01',
        },
      },
    },
  )

  const car = new Car({
    name: 'Fiat Panda 2020',
    supplier: USER_ID,
    hostCar: true,
    status: bookcarsTypes.CarStatus.Active,
    minimumAge: 21,
    locations: [LOCATION_ID],
    dailyPrice: 50,
    deposit: 200,
    available: true,
    type: bookcarsTypes.CarType.Gasoline,
    gearbox: bookcarsTypes.GearboxType.Manual,
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
    range: bookcarsTypes.CarRange.Mini,
  })
  await car.save()
  CAR_ID = car._id.toString()

  const booking = new Booking({
    supplier: USER_ID,
    car: CAR_ID,
    driver: USER_ID,
    pickupLocation: LOCATION_ID,
    dropOffLocation: LOCATION_ID,
    from: new Date(YEAR, MONTH - 1, 5),
    to: new Date(YEAR, MONTH - 1, 10),
    status: bookcarsTypes.BookingStatus.Pending,
    expireAt: undefined,
    price: 250,
  })
  await booking.save()
  BOOKING_ID = booking._id.toString()
})

//
// Closing and cleaning the database connection after running the test suite
//
afterAll(async () => {
  await CommissionTransaction.deleteMany({ booking: BOOKING_ID })
  await Payout.deleteMany({ host: USER_ID })
  await Booking.deleteOne({ _id: BOOKING_ID })
  await Car.deleteOne({ _id: CAR_ID })
  await testHelper.deleteLocation(LOCATION_ID)
  await testHelper.close()
  await databaseHelper.close()
})

describe('ledgerHelper', () => {
  it('should create one idempotent ledger entry per paid booking', async () => {
    // resolution: host commissionPct (30) overrides the global default
    const entry = await ledgerHelper.ensureLedgerEntry(BOOKING_ID)
    expect(entry).toBeTruthy()
    expect(entry!.totalBookingAmount).toBe(250)
    expect(entry!.commissionValue).toBe(30)
    expect(entry!.platformCommission).toBe(75)
    expect(entry!.supplierEarnings).toBe(175)
    expect(entry!.hostCar).toBeTruthy()
    expect(entry!.payoutStatus).toBe('pending')

    // idempotent
    const again = await ledgerHelper.ensureLedgerEntry(BOOKING_ID)
    expect(again!._id.toString()).toBe(entry!._id.toString())
    expect(await CommissionTransaction.countDocuments({ booking: BOOKING_ID })).toBe(1)
  })

  it('should void the entry when the booking is cancelled and restore it when re-paid', async () => {
    await ledgerHelper.onBookingStatusChange(BOOKING_ID, bookcarsTypes.BookingStatus.Paid, bookcarsTypes.BookingStatus.Cancelled)
    let entry = await CommissionTransaction.findOne({ booking: BOOKING_ID })
    expect(entry?.payoutStatus).toBe('voided')

    await ledgerHelper.onBookingStatusChange(BOOKING_ID, bookcarsTypes.BookingStatus.Cancelled, bookcarsTypes.BookingStatus.Paid)
    entry = await CommissionTransaction.findOne({ booking: BOOKING_ID })
    expect(entry?.payoutStatus).toBe('pending')
  })

  it('should fall back to the global commission when the host has no override', async () => {
    await User.updateOne({ _id: USER_ID }, { $unset: { 'host.commissionPct': '' } })
    const user = await User.findById(USER_ID)
    const settings = await Setting.findOne({})
    const expected = settings?.platformCommissionPct ?? 35
    expect(await ledgerHelper.resolveCommissionPct(user!)).toBe(expected)
    await User.updateOne({ _id: USER_ID }, { $set: { 'host.commissionPct': 30 } })
  })
})

describe('POST /api/generate-payouts/:year/:month', () => {
  it('should generate monthly payouts with guaranteed-minimum top-up (admin only)', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // set entry createdAt inside the target period
    await CommissionTransaction.updateOne(
      { booking: BOOKING_ID },
      { $set: { createdAt: new Date(YEAR, MONTH - 1, 12) } },
      { timestamps: false },
    )

    // test forbidden (regular user)
    let res = await request(app)
      .post(`/api/generate-payouts/${YEAR}/${MONTH}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(403)

    // test failure (invalid period)
    res = await request(app)
      .post(`/api/generate-payouts/${YEAR}/13`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(400)

    // test success
    res = await request(app)
      .post(`/api/generate-payouts/${YEAR}/${MONTH}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)
    expect(res.body.generated).toBeGreaterThan(0)

    const payout = await Payout.findOne({ host: USER_ID, year: YEAR, month: MONTH })
    expect(payout).toBeTruthy()
    expect(payout!.bookingsCount).toBe(1)
    expect(payout!.grossTotal).toBe(250)
    expect(payout!.commissionTotal).toBe(75)
    expect(payout!.shareTotal).toBe(175)
    expect(payout!.guaranteedMinimum).toBe(500)
    // revenue share (175) below the guaranteed minimum (500) -> payout = minimum
    expect(payout!.amount).toBe(500)
    expect(payout!.reference).toBe(`HOST-TEST-01-${YEAR}0${MONTH}`)
    expect(payout!.statementFile).toBeTruthy()

    const entry = await CommissionTransaction.findOne({ booking: BOOKING_ID })
    expect(entry?.payoutStatus).toBe('processing')
    expect(entry?.payout?.toString()).toBe(payout!._id.toString())

    // regeneration is idempotent while pending
    res = await request(app)
      .post(`/api/generate-payouts/${YEAR}/${MONTH}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)
    expect(await Payout.countDocuments({ host: USER_ID, year: YEAR, month: MONTH })).toBe(1)
  })
})

describe('GET /api/payout-statement/:id + GET /api/host-payouts', () => {
  it('should stream the statement to the owner and admin, and list host payouts', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()
    const payout = await Payout.findOne({ host: USER_ID, year: YEAR, month: MONTH })

    // owner
    let res = await request(app)
      .get(`/api/payout-statement/${payout!._id.toString()}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('pdf')

    // admin
    res = await request(app)
      .get(`/api/payout-statement/${payout!._id.toString()}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)

    // host list
    res = await request(app)
      .get('/api/host-payouts')
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0].amount).toBe(500)
  })
})

describe('GET /api/payouts-sepa/:year/:month + POST /api/mark-payout-paid/:id', () => {
  it('should export SEPA CSV and mark payouts paid (admin only)', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // SEPA CSV
    let res = await request(app)
      .get(`/api/payouts-sepa/${YEAR}/${MONTH}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('csv')
    const lines = res.text.split('\r\n')
    expect(lines[0]).toBe('IBAN;Amount;Reference;Name')
    const hostLine = lines.find((l: string) => l.startsWith('HR1210010051863000160'))
    expect(hostLine).toBeTruthy()
    expect(hostLine).toContain(';500.00;')
    expect(hostLine).toContain('Test Host')

    // forbidden for user
    res = await request(app)
      .get(`/api/payouts-sepa/${YEAR}/${MONTH}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(403)

    // admin payout list
    res = await request(app)
      .post(`/api/payouts/${testHelper.PAGE}/${testHelper.SIZE}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ year: YEAR, month: MONTH })
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.length).toBeGreaterThan(0)

    // mark paid
    const payout = await Payout.findOne({ host: USER_ID, year: YEAR, month: MONTH })
    res = await request(app)
      .post(`/api/mark-payout-paid/${payout!._id.toString()}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ reference: 'BANK-REF-123' })
    expect(res.statusCode).toBe(200)
    const paid = await Payout.findById(payout!._id)
    expect(paid?.status).toBe(bookcarsTypes.PayoutStatus.Paid)
    expect(paid?.reference).toBe('BANK-REF-123')
    const entry = await CommissionTransaction.findOne({ booking: BOOKING_ID })
    expect(entry?.payoutStatus).toBe('paid')

    // marking again fails
    res = await request(app)
      .post(`/api/mark-payout-paid/${payout!._id.toString()}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({})
    expect(res.statusCode).toBe(400)

    // paid payouts are skipped on regeneration
    res = await request(app)
      .post(`/api/generate-payouts/${YEAR}/${MONTH}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)
    expect(res.body.skippedPaid).toBeGreaterThan(0)
  })
})
