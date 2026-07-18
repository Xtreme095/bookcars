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
import Notification from '../models/Notification'
import NotificationCounter from '../models/NotificationCounter'
import * as helper from '../utils/helper'
import * as logger from '../utils/logger'
import * as mailHelper from '../utils/mailHelper'
import * as verification from '../verification'

/**
 * Save an in-app notification and send an email to a user.
 *
 * @async
 * @param {env.User} user
 * @param {string} message
 * @param {?string} [emailBody]
 * @returns {Promise<void>}
 */
const notify = async (user: env.User, message: string, emailBody?: string) => {
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
    ${i18n.t('REGARDS')}<br>
    </p>`,
    }
    await mailHelper.sendMail(mailOptions)
  }
}

/**
 * Resolve the stored filename of a renter document, moving it from the temp
 * folder when needed.
 *
 * @async
 * @param {env.User} user
 * @param {string} filename
 * @param {bookcarsTypes.RenterDocumentType} docType
 * @returns {Promise<string>}
 */
const saveRenterDocument = async (user: env.User, filename: string, docType: bookcarsTypes.RenterDocumentType) => {
  const safeFilename = path.basename(filename)
  const tempFile = path.join(env.CDN_TEMP_HOST_DOCUMENTS, safeFilename)

  if (await helper.pathExists(tempFile)) {
    const permanentFilename = `${user._id.toString()}_renter_${docType}_${nanoid()}${path.extname(safeFilename)}`
    const permanentFile = path.join(env.CDN_HOST_DOCUMENTS, permanentFilename)

    const previous = user.documents && user.documents[docType]
    if (previous) {
      const previousFile = path.join(env.CDN_HOST_DOCUMENTS, path.basename(previous))
      if (await helper.pathExists(previousFile)) {
        await asyncFs.unlink(previousFile)
      }
    }

    await asyncFs.rename(tempFile, permanentFile)
    return permanentFilename
  }

  const current = user.documents && user.documents[docType]
  if (current && path.basename(current) === safeFilename) {
    return safeFilename
  }

  throw new Error(`Verification document ${safeFilename} not found`)
}

/**
 * Upload a renter verification document to the temp folder.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const createVerificationDocument = async (req: Request, res: Response) => {
  const { type } = req.params

  try {
    if (!req.file) {
      throw new Error('req.file not found')
    }
    if (!req.file.originalname.includes('.')) {
      throw new Error('File extension not found')
    }
    if (!Object.values(bookcarsTypes.RenterDocumentType).includes(type as bookcarsTypes.RenterDocumentType)) {
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
    logger.error(`[verification.createVerificationDocument] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Delete a temp verification document.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const deleteTempVerificationDocument = async (req: Request, res: Response) => {
  const { file } = req.params

  try {
    const filepath = path.join(env.CDN_TEMP_HOST_DOCUMENTS, path.basename(file))
    if (await helper.pathExists(filepath)) {
      await asyncFs.unlink(filepath)
    }
    res.sendStatus(200)
  } catch (err) {
    logger.error(`[verification.deleteTempVerificationDocument] ${i18n.t('DB_ERROR')} ${file}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Submit renter verification documents (or re-submit after rejection).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const submitVerification = async (req: Request, res: Response) => {
  const { body }: { body: bookcarsTypes.SubmitVerificationPayload } = req

  try {
    const user = await User.findById(req.user?._id)
    if (!user) {
      res.sendStatus(204)
      return
    }

    if (user.type !== bookcarsTypes.UserType.User) {
      res.status(400).send('Only renters can submit verification documents')
      return
    }

    if (user.verification && [bookcarsTypes.VerificationStatus.Pending, bookcarsTypes.VerificationStatus.Approved].includes(user.verification.status)) {
      res.status(400).send('Verification already submitted')
      return
    }

    const { licenseFront, licenseBack, idFront, idBack } = body
    if (!licenseFront || !licenseBack || !idFront) {
      res.status(400).send('Missing required verification documents')
      return
    }

    const documents: bookcarsTypes.RenterDocuments = {
      licenseFront: await saveRenterDocument(user, licenseFront, bookcarsTypes.RenterDocumentType.LicenseFront),
      licenseBack: await saveRenterDocument(user, licenseBack, bookcarsTypes.RenterDocumentType.LicenseBack),
      idFront: await saveRenterDocument(user, idFront, bookcarsTypes.RenterDocumentType.IdFront),
    }
    if (idBack) {
      documents.idBack = await saveRenterDocument(user, idBack, bookcarsTypes.RenterDocumentType.IdBack)
    }

    user.documents = documents

    const provider = verification.getProvider()
    const status = await provider.submit(user)
    user.verification = {
      status,
      method: provider.name,
      submittedAt: new Date(),
    }
    await user.save()

    // confirmation email to the renter (in their language)
    i18n.locale = user.language
    const mailOptions: nodemailer.SendMailOptions = {
      from: env.SMTP_FROM,
      to: user.email,
      subject: i18n.t('VERIFICATION_SUBMITTED_SUBJECT'),
      html: `<p>
    ${i18n.t('HELLO')}${user.fullName},<br><br>
    ${i18n.t('VERIFICATION_SUBMITTED_BODY')}<br><br>
    ${i18n.t('REGARDS')}<br>
    </p>`,
    }
    await mailHelper.sendMail(mailOptions)

    res.json(user.verification)
  } catch (err) {
    logger.error(`[verification.submitVerification] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get the session user's verification state.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getVerification = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user?._id).lean()
    if (!user) {
      res.sendStatus(204)
      return
    }

    res.json({
      documents: user.documents || {},
      verification: user.verification || null,
    })
  } catch (err) {
    logger.error(`[verification.getVerification] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Stream a renter verification document (owner or admin only).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getVerificationDocument = async (req: Request, res: Response) => {
  const { userId, type } = req.params

  try {
    if (!helper.isValidObjectId(userId)) {
      throw new Error('User id is not valid')
    }
    if (!Object.values(bookcarsTypes.RenterDocumentType).includes(type as bookcarsTypes.RenterDocumentType)) {
      throw new Error('Document type not valid')
    }

    const sessionUser = req.user
    if (!sessionUser || (sessionUser.type !== bookcarsTypes.UserType.Admin && sessionUser._id !== userId)) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    const user = await User.findById(userId).lean()
    const filename = user?.documents?.[type as bookcarsTypes.RenterDocumentType]
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
    logger.error(`[verification.getVerificationDocument] ${i18n.t('DB_ERROR')} ${userId}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get renter verifications (admin), paginated, filterable by status.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getVerifications = async (req: Request, res: Response) => {
  try {
    const { body }: { body: bookcarsTypes.GetVerificationsBody } = req
    const page = Number.parseInt(req.params.page, 10)
    const size = Number.parseInt(req.params.size, 10)
    const keyword = escapeStringRegexp(String(req.query.s || ''))
    const options = 'i'

    const $match: Record<string, any> = {
      verification: { $exists: true },
    }

    if (body.statuses && body.statuses.length > 0) {
      $match['verification.status'] = { $in: body.statuses }
    }

    if (keyword) {
      $match.$or = [
        { fullName: { $regex: keyword, $options: options } },
        { email: { $regex: keyword, $options: options } },
      ]
    }

    const verifications = await User.aggregate(
      [
        { $match },
        {
          $project: {
            fullName: 1,
            email: 1,
            phone: 1,
            avatar: 1,
            birthDate: 1,
            documents: 1,
            verification: 1,
          },
        },
        { $sort: { 'verification.submittedAt': -1, _id: 1 } },
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

    res.json(verifications)
  } catch (err) {
    logger.error(`[verification.getVerifications] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Review a renter verification (admin): approve or reject.
 *
 * On approval the license front is also copied into the legacy public
 * licenses folder (`User.license`) so per-supplier licenseRequired checks
 * keep working for verified renters.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const reviewVerification = async (req: Request, res: Response) => {
  const { id } = req.params
  const { body }: { body: bookcarsTypes.ReviewVerificationPayload } = req

  try {
    if (!helper.isValidObjectId(id)) {
      throw new Error('User id is not valid')
    }

    const user = await User.findById(id)
    if (!user || !user.verification) {
      res.sendStatus(204)
      return
    }

    const { status, rejectionReason } = body

    if (![bookcarsTypes.VerificationStatus.Approved, bookcarsTypes.VerificationStatus.Rejected].includes(status)) {
      res.status(400).send('Status not valid')
      return
    }

    if (status === bookcarsTypes.VerificationStatus.Rejected && !rejectionReason) {
      res.status(400).send('Rejection reason is required')
      return
    }

    user.verification.status = status
    user.verification.reviewedBy = new mongoose.Types.ObjectId(req.user?._id)
    user.verification.reviewedAt = new Date()
    user.verification.rejectionReason = status === bookcarsTypes.VerificationStatus.Rejected ? rejectionReason : undefined

    if (status === bookcarsTypes.VerificationStatus.Approved && user.documents?.licenseFront) {
      // legacy compatibility: expose the license for per-supplier licenseRequired checks
      const sourceFile = path.join(env.CDN_HOST_DOCUMENTS, path.basename(user.documents.licenseFront))
      if (await helper.pathExists(sourceFile)) {
        const licenseFilename = `${user._id.toString()}${path.extname(user.documents.licenseFront)}`
        await asyncFs.copyFile(sourceFile, path.join(env.CDN_LICENSES, licenseFilename))
        user.license = licenseFilename
      }
    }

    await user.save()

    // notify the renter in their language
    i18n.locale = user.language
    if (status === bookcarsTypes.VerificationStatus.Approved) {
      await notify(user, i18n.t('VERIFICATION_APPROVED_SUBJECT'), i18n.t('VERIFICATION_APPROVED_BODY'))
    } else {
      await notify(user, i18n.t('VERIFICATION_REJECTED_SUBJECT'), `${i18n.t('VERIFICATION_REJECTED_BODY')}<br><br>${rejectionReason}`)
    }

    res.sendStatus(200)
  } catch (err) {
    logger.error(`[verification.reviewVerification] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}
