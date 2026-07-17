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
import { validateOib } from '../src/controllers/hostController'
import User from '../src/models/User'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DOC1 = 'contract1.pdf'
const DOC1_PATH = path.join(__dirname, `./contracts/${DOC1}`)
const DOC2 = 'contract2.pdf'
const DOC2_PATH = path.join(__dirname, `./contracts/${DOC2}`)

// valid per ISO 7064 MOD 11,10
const VALID_OIB = '12345678903'
// Croatian IBAN example (HNB documentation)
const VALID_IBAN = 'HR1210010051863000160'

let USER_ID: string

const applyPayload = (idDocFront: string, idDocBack: string): bookcarsTypes.ApplyToHostPayload => ({
  address: 'Ilica 1',
  city: 'Zagreb',
  postalCode: '10000',
  countryCode: 'HR',
  oib: VALID_OIB,
  iban: VALID_IBAN,
  swiftBic: 'ZABAHR2X',
  bankAccountHolder: 'Test Host',
  idDocFront,
  idDocBack,
})

//
// Connecting and initializing the database before running the test suite
//
beforeAll(async () => {
  testHelper.initializeLogger()

  await databaseHelper.connect(env.DB_URI, false, false)
  await testHelper.initialize()

  USER_ID = testHelper.getUserId()
})

//
// Closing and cleaning the database connection after running the test suite
//
afterAll(async () => {
  await testHelper.close()
  await databaseHelper.close()
})

describe('validateOib', () => {
  it('should validate Croatian OIB checksums', () => {
    expect(validateOib(VALID_OIB)).toBeTruthy()
    expect(validateOib('69435151530')).toBeTruthy()
    expect(validateOib('12345678901')).toBeFalsy()
    expect(validateOib('1234567890')).toBeFalsy()
    expect(validateOib('abcdefghijk')).toBeFalsy()
  })
})

describe('POST /api/create-host-document/:type', () => {
  it('should upload a temp host document', async () => {
    const token = await testHelper.signinAsUser()

    // test success
    let res = await request(app)
      .post(`/api/create-host-document/${bookcarsTypes.HostDocumentType.IdFront}`)
      .set(env.X_ACCESS_TOKEN, token)
      .attach('file', DOC1_PATH)
    expect(res.statusCode).toBe(200)
    const filename = res.body
    expect(await helper.pathExists(path.join(env.CDN_TEMP_HOST_DOCUMENTS, filename))).toBeTruthy()

    // cleanup temp doc
    res = await request(app)
      .post(`/api/delete-temp-host-document/${bookcarsTypes.HostDocumentType.IdFront}/${filename}`)
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(200)
    expect(await helper.pathExists(path.join(env.CDN_TEMP_HOST_DOCUMENTS, filename))).toBeFalsy()

    // test failure (invalid document type)
    res = await request(app)
      .post('/api/create-host-document/unknown')
      .set(env.X_ACCESS_TOKEN, token)
      .attach('file', DOC1_PATH)
    expect(res.statusCode).toBe(400)

    // test failure (no file)
    res = await request(app)
      .post(`/api/create-host-document/${bookcarsTypes.HostDocumentType.IdFront}`)
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(400)

    // test failure (no token)
    res = await request(app)
      .post(`/api/create-host-document/${bookcarsTypes.HostDocumentType.IdFront}`)
      .attach('file', DOC1_PATH)
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/apply-to-host', () => {
  it('should create, validate and update a host application', async () => {
    const token = await testHelper.signinAsUser()

    // upload both documents
    let res = await request(app)
      .post(`/api/create-host-document/${bookcarsTypes.HostDocumentType.IdFront}`)
      .set(env.X_ACCESS_TOKEN, token)
      .attach('file', DOC1_PATH)
    expect(res.statusCode).toBe(200)
    const idDocFront = res.body

    res = await request(app)
      .post(`/api/create-host-document/${bookcarsTypes.HostDocumentType.IdBack}`)
      .set(env.X_ACCESS_TOKEN, token)
      .attach('file', DOC2_PATH)
    expect(res.statusCode).toBe(200)
    const idDocBack = res.body

    // test failure (missing fields)
    res = await request(app)
      .post('/api/apply-to-host')
      .set(env.X_ACCESS_TOKEN, token)
      .send({ address: 'Ilica 1' })
    expect(res.statusCode).toBe(400)

    // test failure (invalid OIB)
    res = await request(app)
      .post('/api/apply-to-host')
      .set(env.X_ACCESS_TOKEN, token)
      .send({ ...applyPayload(idDocFront, idDocBack), oib: '12345678901' })
    expect(res.statusCode).toBe(400)

    // test failure (invalid IBAN)
    res = await request(app)
      .post('/api/apply-to-host')
      .set(env.X_ACCESS_TOKEN, token)
      .send({ ...applyPayload(idDocFront, idDocBack), iban: 'HR00INVALID' })
    expect(res.statusCode).toBe(400)

    // test success
    res = await request(app)
      .post('/api/apply-to-host')
      .set(env.X_ACCESS_TOKEN, token)
      .send(applyPayload(idDocFront, idDocBack))
    expect(res.statusCode).toBe(200)

    const user = await User.findById(USER_ID)
    expect(user?.host?.status).toBe(bookcarsTypes.HostStatus.Pending)
    expect(user?.host?.oib).toBe(VALID_OIB)
    expect(user?.host?.iban).toBe(VALID_IBAN)
    expect(user?.host?.idDocFront).toBeTruthy()
    expect(user?.host?.idDocBack).toBeTruthy()
    // temp documents must have been moved to the permanent folder
    expect(await helper.pathExists(path.join(env.CDN_TEMP_HOST_DOCUMENTS, idDocFront))).toBeFalsy()
    expect(await helper.pathExists(path.join(env.CDN_HOST_DOCUMENTS, user!.host!.idDocFront!))).toBeTruthy()

    // test success (edit while pending, keeping the same documents)
    res = await request(app)
      .post('/api/apply-to-host')
      .set(env.X_ACCESS_TOKEN, token)
      .send({ ...applyPayload(user!.host!.idDocFront!, user!.host!.idDocBack!), city: 'Split' })
    expect(res.statusCode).toBe(200)
    const updated = await User.findById(USER_ID)
    expect(updated?.host?.city).toBe('Split')

    // test failure (unknown document filename)
    res = await request(app)
      .post('/api/apply-to-host')
      .set(env.X_ACCESS_TOKEN, token)
      .send(applyPayload('unknown.pdf', 'unknown.pdf'))
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/host-application', () => {
  it('should return the session user host application', async () => {
    const token = await testHelper.signinAsUser()

    const res = await request(app)
      .get('/api/host-application')
      .set(env.X_ACCESS_TOKEN, token)
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe(bookcarsTypes.HostStatus.Pending)
    expect(res.body.iban).toBe(VALID_IBAN)
  })
})

describe('GET /api/host-document/:userId/:type', () => {
  it('should stream host documents to the owner and admin only', async () => {
    const userToken = await testHelper.signinAsUser()
    const adminToken = await testHelper.signinAsAdmin()

    // owner
    let res = await request(app)
      .get(`/api/host-document/${USER_ID}/${bookcarsTypes.HostDocumentType.IdFront}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(200)

    // admin
    res = await request(app)
      .get(`/api/host-document/${USER_ID}/${bookcarsTypes.HostDocumentType.IdBack}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)

    // another user (forbidden)
    const otherEmail = `host-doc-other.${testHelper.GetRandromObjectIdAsString()}@test.bookcars.ma`
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
      .get(`/api/host-document/${USER_ID}/${bookcarsTypes.HostDocumentType.IdFront}`)
      .set(env.X_ACCESS_TOKEN, otherToken)
    expect(res.statusCode).toBe(403)
    await User.deleteOne({ _id: otherUser._id })

    // invalid document type
    res = await request(app)
      .get(`/api/host-document/${USER_ID}/unknown`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/hosts/:page/:size', () => {
  it('should return hosts to admin only', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // test success (all hosts)
    let res = await request(app)
      .post('/api/hosts/1/10')
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({})
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.length).toBeGreaterThan(0)

    // test success (status filter)
    res = await request(app)
      .post('/api/hosts/1/10')
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ statuses: [bookcarsTypes.HostStatus.Pending] })
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.length).toBeGreaterThan(0)

    res = await request(app)
      .post('/api/hosts/1/10')
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ statuses: [bookcarsTypes.HostStatus.Approved] })
    expect(res.statusCode).toBe(200)
    expect(res.body[0].resultData.length).toBe(0)

    // test forbidden (regular user)
    res = await request(app)
      .post('/api/hosts/1/10')
      .set(env.X_ACCESS_TOKEN, userToken)
      .send({})
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/host/:id', () => {
  it('should return a host to admin only', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // test success
    let res = await request(app)
      .get(`/api/host/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(200)
    expect(res.body.host.status).toBe(bookcarsTypes.HostStatus.Pending)

    // test forbidden (regular user)
    res = await request(app)
      .get(`/api/host/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, userToken)
    expect(res.statusCode).toBe(403)

    // test not found (user without host application)
    res = await request(app)
      .get(`/api/host/${testHelper.GetRandromObjectIdAsString()}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
    expect(res.statusCode).toBe(204)
  })
})

describe('POST /api/review-host/:id', () => {
  it('should approve, reject and suspend host applications (admin only)', async () => {
    const adminToken = await testHelper.signinAsAdmin()
    const userToken = await testHelper.signinAsUser()

    // test forbidden (regular user)
    let res = await request(app)
      .post(`/api/review-host/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, userToken)
      .send({ status: bookcarsTypes.HostStatus.Approved })
    expect(res.statusCode).toBe(403)

    // test failure (rejection without reason)
    res = await request(app)
      .post(`/api/review-host/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.HostStatus.Rejected })
    expect(res.statusCode).toBe(400)

    // test failure (invalid status)
    res = await request(app)
      .post(`/api/review-host/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.HostStatus.Pending })
    expect(res.statusCode).toBe(400)

    // reject
    res = await request(app)
      .post(`/api/review-host/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.HostStatus.Rejected, rejectionReason: 'Document not readable' })
    expect(res.statusCode).toBe(200)
    let user = await User.findById(USER_ID)
    expect(user?.host?.status).toBe(bookcarsTypes.HostStatus.Rejected)
    expect(user?.host?.rejectionReason).toBe('Document not readable')

    // re-apply after rejection
    const token = await testHelper.signinAsUser()
    res = await request(app)
      .post('/api/apply-to-host')
      .set(env.X_ACCESS_TOKEN, token)
      .send(applyPayload(user!.host!.idDocFront!, user!.host!.idDocBack!))
    expect(res.statusCode).toBe(200)
    user = await User.findById(USER_ID)
    expect(user?.host?.status).toBe(bookcarsTypes.HostStatus.Pending)
    expect(user?.host?.rejectionReason).toBeFalsy()

    // approve with commission override and guaranteed minimum
    res = await request(app)
      .post(`/api/review-host/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({
        status: bookcarsTypes.HostStatus.Approved,
        commissionPct: 30,
        guaranteedMonthlyMinimum: 250,
        contractNumber: 'HOST-2026-001',
      })
    expect(res.statusCode).toBe(200)
    user = await User.findById(USER_ID)
    expect(user?.host?.status).toBe(bookcarsTypes.HostStatus.Approved)
    expect(user?.host?.commissionPct).toBe(30)
    expect(user?.host?.guaranteedMonthlyMinimum).toBe(250)
    expect(user?.host?.contractNumber).toBe('HOST-2026-001')

    // applying again while approved must fail
    res = await request(app)
      .post('/api/apply-to-host')
      .set(env.X_ACCESS_TOKEN, token)
      .send(applyPayload(user!.host!.idDocFront!, user!.host!.idDocBack!))
    expect(res.statusCode).toBe(400)

    // suspend
    res = await request(app)
      .post(`/api/review-host/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.HostStatus.Suspended })
    expect(res.statusCode).toBe(200)
    user = await User.findById(USER_ID)
    expect(user?.host?.status).toBe(bookcarsTypes.HostStatus.Suspended)
    expect(user?.host?.suspendedAt).toBeTruthy()

    // reactivate (approve again)
    res = await request(app)
      .post(`/api/review-host/${USER_ID}`)
      .set(env.X_ACCESS_TOKEN, adminToken)
      .send({ status: bookcarsTypes.HostStatus.Approved })
    expect(res.statusCode).toBe(200)
    user = await User.findById(USER_ID)
    expect(user?.host?.status).toBe(bookcarsTypes.HostStatus.Approved)
    expect(user?.host?.suspendedAt).toBeFalsy()

    // cleanup documents + host subdoc
    for (const doc of [user!.host!.idDocFront!, user!.host!.idDocBack!]) {
      const docPath = path.join(env.CDN_HOST_DOCUMENTS, doc)
      if (await helper.pathExists(docPath)) {
        await asyncFs.unlink(docPath)
      }
    }
    user!.host = undefined
    await user!.save()
  })
})
