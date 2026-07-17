import path from 'node:path'
import asyncFs from 'node:fs/promises'
import escapeStringRegexp from 'escape-string-regexp'
import { Request, Response } from 'express'
import mongoose from 'mongoose'
import { nanoid } from 'nanoid'
import validator from 'validator'
import nodemailer from 'nodemailer'
import * as bookcarsTypes from ':bookcars-types'
import i18n from '../lang/i18n'
import * as env from '../config/env.config'
import User from '../models/User'
import Notification from '../models/Notification'
import NotificationCounter from '../models/NotificationCounter'
import * as helper from '../utils/helper'
import * as logger from '../utils/logger'
import * as mailHelper from '../utils/mailHelper'

/**
 * Validate a Croatian OIB (11 digits, ISO 7064 MOD 11,10 checksum).
 *
 * @export
 * @param {string} oib
 * @returns {boolean}
 */
export const validateOib = (oib: string): boolean => {
  if (!/^\d{11}$/.test(oib)) {
    return false
  }
  let a = 10
  for (let i = 0; i < 10; i += 1) {
    a = (a + Number.parseInt(oib[i], 10)) % 10
    if (a === 0) {
      a = 10
    }
    a = (a * 2) % 11
  }
  const control = (11 - a) % 10
  return control === Number.parseInt(oib[10], 10)
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
  // notification
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

  // mail
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
 * Resolve the permanent filename of a host document and move it from the
 * temp folder if needed. Returns the filename to store on the host profile.
 *
 * @async
 * @param {env.User} user
 * @param {string} filename
 * @param {bookcarsTypes.HostDocumentType} docType
 * @returns {Promise<string>}
 */
const saveHostDocument = async (user: env.User, filename: string, docType: bookcarsTypes.HostDocumentType) => {
  const safeFilename = path.basename(filename)
  const tempFile = path.join(env.CDN_TEMP_HOST_DOCUMENTS, safeFilename)

  if (await helper.pathExists(tempFile)) {
    const permanentFilename = `${user._id.toString()}_${docType}_${nanoid()}${path.extname(safeFilename)}`
    const permanentFile = path.join(env.CDN_HOST_DOCUMENTS, permanentFilename)

    // remove the previously stored document of this type (if any)
    const previous = user.host && user.host[docType === bookcarsTypes.HostDocumentType.IdFront ? 'idDocFront' : 'idDocBack']
    if (previous) {
      const previousFile = path.join(env.CDN_HOST_DOCUMENTS, path.basename(previous))
      if (await helper.pathExists(previousFile)) {
        await asyncFs.unlink(previousFile)
      }
    }

    await asyncFs.rename(tempFile, permanentFile)
    return permanentFilename
  }

  // not a temp file: must be the document already stored on the profile (re-apply without re-upload)
  const current = user.host && user.host[docType === bookcarsTypes.HostDocumentType.IdFront ? 'idDocFront' : 'idDocBack']
  if (current && path.basename(current) === safeFilename) {
    return safeFilename
  }

  throw new Error(`Host document ${safeFilename} not found`)
}

/**
 * Apply to become a host (or re-apply after rejection / edit while pending).
 *
 * The applicant is always the session user (from the token) — the client
 * cannot apply on behalf of another user.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const apply = async (req: Request, res: Response) => {
  const { body }: { body: bookcarsTypes.ApplyToHostPayload } = req

  try {
    const sessionUserId = req.user?._id
    const user = await User.findById(sessionUserId)

    if (!user) {
      res.sendStatus(204)
      return
    }

    if (user.type !== bookcarsTypes.UserType.User) {
      res.status(400).send('Only regular users can apply to become hosts')
      return
    }

    if (user.host && [bookcarsTypes.HostStatus.Approved, bookcarsTypes.HostStatus.Suspended].includes(user.host.status)) {
      res.status(400).send('Host application already processed')
      return
    }

    const {
      address,
      city,
      postalCode,
      countryCode,
      oib,
      iban,
      swiftBic,
      bankAccountHolder,
      idDocFront,
      idDocBack,
    } = body

    if (!address || !city || !postalCode || !oib || !iban || !bankAccountHolder || !idDocFront || !idDocBack) {
      res.status(400).send('Missing required host application fields')
      return
    }

    if (!validateOib(oib)) {
      res.status(400).send('OIB is not valid')
      return
    }

    if (!validator.isIBAN(iban.replace(/\s/g, '').toUpperCase())) {
      res.status(400).send('IBAN is not valid')
      return
    }

    const idDocFrontFilename = await saveHostDocument(user, idDocFront, bookcarsTypes.HostDocumentType.IdFront)
    const idDocBackFilename = await saveHostDocument(user, idDocBack, bookcarsTypes.HostDocumentType.IdBack)

    // admin-managed fields survive re-application
    const commissionPct = user.host?.commissionPct
    const guaranteedMonthlyMinimum = user.host?.guaranteedMonthlyMinimum
    const contractNumber = user.host?.contractNumber
    const notes = user.host?.notes

    user.host = {
      status: bookcarsTypes.HostStatus.Pending,
      appliedAt: new Date(),
      address,
      city,
      postalCode,
      countryCode: countryCode || 'HR',
      oib,
      iban: iban.replace(/\s/g, '').toUpperCase(),
      swiftBic,
      bankAccountHolder,
      commissionPct,
      guaranteedMonthlyMinimum,
      contractNumber,
      notes,
      idDocFront: idDocFrontFilename,
      idDocBack: idDocBackFilename,
    }

    await user.save()

    // confirmation email to the applicant (in their language)
    i18n.locale = user.language
    const mailOptions: nodemailer.SendMailOptions = {
      from: env.SMTP_FROM,
      to: user.email,
      subject: i18n.t('HOST_APPLICATION_RECEIVED_SUBJECT'),
      html: `<p>
    ${i18n.t('HELLO')}${user.fullName},<br><br>
    ${i18n.t('HOST_APPLICATION_RECEIVED_BODY')}<br><br>
    ${i18n.t('REGARDS')}<br>
    </p>`,
    }
    await mailHelper.sendMail(mailOptions)

    // notify admin
    const admin = !!env.ADMIN_EMAIL && (await User.findOne({ email: env.ADMIN_EMAIL, type: bookcarsTypes.UserType.Admin }))
    if (admin) {
      i18n.locale = admin.language
      const message = `${user.fullName} ${i18n.t('NEW_HOST_APPLICATION_NOTIFICATION')}`
      await notify(admin, message, helper.joinURL(env.ADMIN_HOST, `host?u=${user._id.toString()}`))
    }

    res.sendStatus(200)
  } catch (err) {
    logger.error(`[host.apply] ${i18n.t('DB_ERROR')} ${JSON.stringify(body)}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get the session user's host application/profile.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getHostApplication = async (req: Request, res: Response) => {
  try {
    const sessionUserId = req.user?._id
    const user = await User.findById(sessionUserId).lean()

    if (!user) {
      res.sendStatus(204)
      return
    }

    if (!user.host) {
      res.sendStatus(204)
      return
    }

    res.json(user.host)
  } catch (err) {
    logger.error(`[host.getHostApplication] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Upload a host identity document to the temp folder.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const createHostDocument = async (req: Request, res: Response) => {
  const { type } = req.params

  try {
    if (!req.file) {
      throw new Error('req.file not found')
    }
    if (!req.file.originalname.includes('.')) {
      throw new Error('File extension not found')
    }
    if (!Object.values(bookcarsTypes.HostDocumentType).includes(type as bookcarsTypes.HostDocumentType)) {
      throw new Error('Document type not valid')
    }

    const ext = path.extname(req.file.originalname).toLowerCase()
    if (!env.allowedLicenseExtensions.includes(ext)) {
      res.status(400).send('Invalid document file type')
      return
    }

    const filename = `${nanoid()}${ext}`
    const filepath = path.join(env.CDN_TEMP_HOST_DOCUMENTS, filename)

    await asyncFs.writeFile(filepath, req.file.buffer)
    res.json(filename)
  } catch (err) {
    logger.error(`[host.createHostDocument] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Delete a temp host document.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const deleteTempHostDocument = async (req: Request, res: Response) => {
  const { file } = req.params

  try {
    const filepath = path.join(env.CDN_TEMP_HOST_DOCUMENTS, path.basename(file))
    if (await helper.pathExists(filepath)) {
      await asyncFs.unlink(filepath)
    }
    res.sendStatus(200)
  } catch (err) {
    logger.error(`[host.deleteTempHostDocument] ${i18n.t('DB_ERROR')} ${file}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Stream a host identity document (owner or admin only).
 *
 * Host documents are stored outside the public CDN root and are only
 * reachable through this authenticated endpoint.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getHostDocument = async (req: Request, res: Response) => {
  const { userId, type } = req.params

  try {
    if (!helper.isValidObjectId(userId)) {
      throw new Error('User id is not valid')
    }
    if (!Object.values(bookcarsTypes.HostDocumentType).includes(type as bookcarsTypes.HostDocumentType)) {
      throw new Error('Document type not valid')
    }

    const sessionUser = req.user
    if (!sessionUser || (sessionUser.type !== bookcarsTypes.UserType.Admin && sessionUser._id !== userId)) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    const user = await User.findById(userId).lean()
    if (!user || !user.host) {
      res.sendStatus(204)
      return
    }

    const filename = type === bookcarsTypes.HostDocumentType.IdFront ? user.host.idDocFront : user.host.idDocBack
    if (!filename) {
      res.sendStatus(204)
      return
    }

    const filepath = path.join(env.CDN_HOST_DOCUMENTS, path.basename(filename))
    if (!(await helper.pathExists(filepath))) {
      res.sendStatus(204)
      return
    }

    res.sendFile(path.resolve(filepath))
  } catch (err) {
    logger.error(`[host.getHostDocument] ${i18n.t('DB_ERROR')} ${userId}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get hosts (admin), paginated, filterable by status and keyword.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getHosts = async (req: Request, res: Response) => {
  try {
    const { body }: { body: bookcarsTypes.GetHostsBody } = req
    const page = Number.parseInt(req.params.page, 10)
    const size = Number.parseInt(req.params.size, 10)
    const keyword = escapeStringRegexp(String(req.query.s || ''))
    const options = 'i'

    const $match: Record<string, any> = {
      host: { $exists: true },
    }

    if (body.statuses && body.statuses.length > 0) {
      $match['host.status'] = { $in: body.statuses }
    }

    if (keyword) {
      $match.$or = [
        { fullName: { $regex: keyword, $options: options } },
        { email: { $regex: keyword, $options: options } },
      ]
    }

    const hosts = await User.aggregate(
      [
        { $match },
        {
          $project: {
            fullName: 1,
            email: 1,
            phone: 1,
            avatar: 1,
            language: 1,
            host: 1,
            createdAt: 1,
          },
        },
        { $sort: { 'host.appliedAt': -1, _id: 1 } },
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

    res.json(hosts)
  } catch (err) {
    logger.error(`[host.getHosts] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get a host by user id (admin).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getHost = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    if (!helper.isValidObjectId(id)) {
      throw new Error('User id is not valid')
    }

    const user = await User.findById(id, {
      fullName: 1,
      email: 1,
      phone: 1,
      avatar: 1,
      language: 1,
      birthDate: 1,
      host: 1,
      createdAt: 1,
    }).lean()

    if (!user || !user.host) {
      res.sendStatus(204)
      return
    }

    res.json(user)
  } catch (err) {
    logger.error(`[host.getHost] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Review a host application (admin): approve, reject, suspend or reactivate.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const reviewHost = async (req: Request, res: Response) => {
  const { id } = req.params
  const { body }: { body: bookcarsTypes.ReviewHostPayload } = req

  try {
    if (!helper.isValidObjectId(id)) {
      throw new Error('User id is not valid')
    }

    const user = await User.findById(id)
    if (!user || !user.host) {
      res.sendStatus(204)
      return
    }

    const { status, rejectionReason, commissionPct, guaranteedMonthlyMinimum, contractNumber, notes } = body

    if (![bookcarsTypes.HostStatus.Approved, bookcarsTypes.HostStatus.Rejected, bookcarsTypes.HostStatus.Suspended].includes(status)) {
      res.status(400).send('Status not valid')
      return
    }

    if (status === bookcarsTypes.HostStatus.Rejected && !rejectionReason) {
      res.status(400).send('Rejection reason is required')
      return
    }

    if (commissionPct !== undefined && (commissionPct < 0 || commissionPct > 100)) {
      res.status(400).send('Commission is not valid')
      return
    }

    user.host.status = status
    user.host.reviewedBy = new mongoose.Types.ObjectId(req.user?._id)
    user.host.reviewedAt = new Date()
    user.host.rejectionReason = status === bookcarsTypes.HostStatus.Rejected ? rejectionReason : undefined
    user.host.suspendedAt = status === bookcarsTypes.HostStatus.Suspended ? new Date() : undefined
    if (commissionPct !== undefined) {
      user.host.commissionPct = commissionPct
    }
    if (guaranteedMonthlyMinimum !== undefined) {
      user.host.guaranteedMonthlyMinimum = guaranteedMonthlyMinimum
    }
    if (contractNumber !== undefined) {
      user.host.contractNumber = contractNumber
    }
    if (notes !== undefined) {
      user.host.notes = notes
    }

    await user.save()

    // notify the host in their language
    i18n.locale = user.language
    const frontendHostUrl = helper.joinURL(env.FRONTEND_HOST, 'host')
    if (status === bookcarsTypes.HostStatus.Approved) {
      await notify(user, i18n.t('HOST_APPROVED_SUBJECT'), frontendHostUrl, i18n.t('HOST_APPROVED_BODY'))
    } else if (status === bookcarsTypes.HostStatus.Rejected) {
      await notify(user, i18n.t('HOST_REJECTED_SUBJECT'), frontendHostUrl, `${i18n.t('HOST_REJECTED_BODY')}<br><br>${rejectionReason}`)
    } else {
      await notify(user, i18n.t('HOST_SUSPENDED_SUBJECT'), frontendHostUrl, i18n.t('HOST_SUSPENDED_BODY'))
    }

    res.sendStatus(200)
  } catch (err) {
    logger.error(`[host.reviewHost] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}
