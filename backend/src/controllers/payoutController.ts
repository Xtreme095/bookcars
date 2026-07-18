import path from 'node:path'
import { Request, Response } from 'express'
import { nanoid } from 'nanoid'
import * as bookcarsTypes from ':bookcars-types'
import i18n from '../lang/i18n'
import * as env from '../config/env.config'
import Booking from '../models/Booking'
import CommissionTransaction from '../models/CommissionTransaction'
import Payout from '../models/Payout'
import User from '../models/User'
import * as helper from '../utils/helper'
import * as logger from '../utils/logger'
import * as statementHelper from '../utils/statementHelper'

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Build the payment reference of a payout.
 *
 * @param {env.User} host
 * @param {number} year
 * @param {number} month
 * @returns {string}
 */
const buildReference = (host: env.User, year: number, month: number) => {
  const contract = host.host?.contractNumber
  const base = contract || `HOST-${host._id.toString().substring(18).toUpperCase()}`
  return `${base}-${year}${String(month).padStart(2, '0')}`
}

/**
 * Generate (or regenerate) monthly payouts for all hosts (admin).
 *
 * Includes hosts with ledger entries in the month AND approved hosts with a
 * guaranteed monthly minimum (they receive the minimum even with zero
 * bookings). Already-paid payouts are left untouched.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const generatePayouts = async (req: Request, res: Response) => {
  const { year: _year, month: _month } = req.params

  try {
    const year = Number.parseInt(_year, 10)
    const month = Number.parseInt(_month, 10)
    if (!year || !month || month < 1 || month > 12) {
      res.status(400).send('Period is not valid')
      return
    }

    const periodStart = new Date(year, month - 1, 1)
    const periodEnd = new Date(year, month, 1)

    // ledger entries settled in the period, from host cars, not yet paid out
    const entries = await CommissionTransaction.find({
      hostCar: true,
      payoutStatus: { $in: ['pending', 'processing'] },
      createdAt: { $gte: periodStart, $lt: periodEnd },
    }).lean()

    const entriesByHost = new Map<string, typeof entries>()
    for (const entry of entries) {
      const hostId = entry.supplier.toString()
      if (!entriesByHost.has(hostId)) {
        entriesByHost.set(hostId, [])
      }
      entriesByHost.get(hostId)!.push(entry)
    }

    // hosts owed the guaranteed minimum even without bookings
    const guaranteedHosts = await User.find({
      'host.status': bookcarsTypes.HostStatus.Approved,
      'host.guaranteedMonthlyMinimum': { $gt: 0 },
    }).select('_id').lean()
    const hostIds = new Set<string>([
      ...entriesByHost.keys(),
      ...guaranteedHosts.map((h) => h._id.toString()),
    ])

    await helper.mkdir(env.CDN_STATEMENTS)

    let generated = 0
    let skippedPaid = 0

    for (const hostId of hostIds) {
      const host = await User.findById(hostId)
      if (!host || !host.host) {
        continue
      }

      const existing = await Payout.findOne({ host: hostId, year, month })
      if (existing && existing.status === bookcarsTypes.PayoutStatus.Paid) {
        skippedPaid += 1
        continue
      }

      const hostEntries = entriesByHost.get(hostId) || []
      const grossTotal = round2(hostEntries.reduce((sum, e) => sum + e.totalBookingAmount, 0))
      const commissionTotal = round2(hostEntries.reduce((sum, e) => sum + e.platformCommission, 0))
      const shareTotal = round2(hostEntries.reduce((sum, e) => sum + e.supplierEarnings, 0))
      const guaranteedMinimum = host.host.guaranteedMonthlyMinimum || 0
      const amount = round2(Math.max(shareTotal, guaranteedMinimum))
      const reference = buildReference(host, year, month)

      const payout = existing || new Payout({ host: host._id, year, month })
      payout.entries = hostEntries.map((e) => e._id)
      payout.bookingsCount = hostEntries.length
      payout.grossTotal = grossTotal
      payout.commissionTotal = commissionTotal
      payout.shareTotal = shareTotal
      payout.guaranteedMinimum = guaranteedMinimum
      payout.amount = amount
      payout.currency = 'EUR'
      payout.status = bookcarsTypes.PayoutStatus.Pending
      payout.reference = reference

      // statement PDF
      const language = host.language === 'hr' ? 'hr' : 'en'
      const bookings = await Booking.find({ _id: { $in: hostEntries.map((e) => e.booking) } })
        .populate<{ car: env.Car }>('car')
        .lean()
      const bookingById = new Map(bookings.map((b) => [b._id.toString(), b]))

      const statementEntries: statementHelper.StatementEntry[] = hostEntries.map((entry) => {
        const booking = bookingById.get(entry.booking.toString())
        return {
          bookingId: entry.booking.toString(),
          carName: booking?.car?.name || '',
          from: booking?.from || entry.createdAt,
          to: booking?.to || entry.createdAt,
          gross: entry.totalBookingAmount,
          commissionPct: entry.commissionValue,
          commission: entry.platformCommission,
          share: entry.supplierEarnings,
        }
      })

      if (payout.statementFile) {
        const oldFile = path.join(env.CDN_STATEMENTS, path.basename(payout.statementFile))
        if (await helper.pathExists(oldFile)) {
          const asyncFs = await import('node:fs/promises')
          await asyncFs.unlink(oldFile)
        }
      }
      const statementFile = `${host._id.toString()}_${year}_${String(month).padStart(2, '0')}_${nanoid()}.pdf`
      await statementHelper.generateStatementPDF(
        {
          language,
          year,
          month,
          reference,
          hostName: host.fullName,
          hostAddress: host.host.address ? `${host.host.address}, ${host.host.postalCode} ${host.host.city}` : undefined,
          hostOib: host.host.oib,
          hostIban: host.host.iban,
          entries: statementEntries,
          grossTotal,
          commissionTotal,
          shareTotal,
          guaranteedMinimum,
          amount,
        },
        path.join(env.CDN_STATEMENTS, statementFile),
      )
      payout.statementFile = statementFile

      await payout.save()

      // link entries to the payout
      await CommissionTransaction.updateMany(
        { _id: { $in: hostEntries.map((e) => e._id) } },
        { $set: { payoutStatus: 'processing', payout: payout._id } },
      )

      generated += 1
    }

    res.json({ generated, skippedPaid })
  } catch (err) {
    logger.error(`[payout.generatePayouts] ${i18n.t('DB_ERROR')} ${_year}/${_month}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get payouts of a period (admin).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getPayouts = async (req: Request, res: Response) => {
  try {
    const { body }: { body: bookcarsTypes.GetPayoutsBody } = req
    const page = Number.parseInt(req.params.page, 10)
    const size = Number.parseInt(req.params.size, 10)

    const $match: Record<string, any> = {
      year: body.year,
      month: body.month,
    }
    if (body.statuses && body.statuses.length > 0) {
      $match.status = { $in: body.statuses }
    }

    const payouts = await Payout.aggregate([
      { $match },
      {
        $lookup: {
          from: 'User',
          let: { hostId: '$host' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$hostId'] } } },
            { $project: { fullName: 1, email: 1, avatar: 1, 'host.iban': 1, 'host.contractNumber': 1 } },
          ],
          as: 'host',
        },
      },
      { $unwind: { path: '$host', preserveNullAndEmptyArrays: false } },
      { $sort: { amount: -1, _id: 1 } },
      {
        $facet: {
          resultData: [{ $skip: (page - 1) * size }, { $limit: size }],
          pageInfo: [{ $count: 'totalRecords' }],
        },
      },
    ])

    res.json(payouts)
  } catch (err) {
    logger.error(`[payout.getPayouts] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Get the session host's payouts.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getHostPayouts = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user?._id)
    if (!user || !user.host) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    const payouts = await Payout.find({ host: user._id })
      .sort({ year: -1, month: -1 })
      .lean()

    res.json(payouts)
  } catch (err) {
    logger.error(`[payout.getHostPayouts] ${i18n.t('DB_ERROR')}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Mark a payout as paid (admin).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const markPayoutPaid = async (req: Request, res: Response) => {
  const { id } = req.params
  const { body }: { body: bookcarsTypes.MarkPayoutPaidPayload } = req

  try {
    if (!helper.isValidObjectId(id)) {
      throw new Error('Payout id is not valid')
    }

    const payout = await Payout.findById(id)
    if (!payout) {
      res.sendStatus(204)
      return
    }

    if (payout.status === bookcarsTypes.PayoutStatus.Paid) {
      res.status(400).send('Payout is already paid')
      return
    }

    payout.status = bookcarsTypes.PayoutStatus.Paid
    payout.paidAt = new Date()
    if (body.reference) {
      payout.reference = body.reference
    }
    await payout.save()

    await CommissionTransaction.updateMany(
      { _id: { $in: payout.entries } },
      { $set: { payoutStatus: 'paid', payoutDate: payout.paidAt, payoutReference: payout.reference } },
    )

    res.sendStatus(200)
  } catch (err) {
    logger.error(`[payout.markPayoutPaid] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Export pending payouts of a period as a SEPA-compatible CSV for bank upload
 * (admin). Columns: IBAN;amount;reference;name — semicolon-delimited, UTF-8.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const exportSepaCsv = async (req: Request, res: Response) => {
  const { year: _year, month: _month } = req.params

  try {
    const year = Number.parseInt(_year, 10)
    const month = Number.parseInt(_month, 10)

    const payouts = await Payout.find({ year, month, status: bookcarsTypes.PayoutStatus.Pending, amount: { $gt: 0 } })
      .populate<{ host: env.User }>('host')
      .lean()

    const rows = ['IBAN;Amount;Reference;Name']
    for (const payout of payouts) {
      const iban = payout.host.host?.iban || ''
      const name = (payout.host.host?.bankAccountHolder || payout.host.fullName).replace(/;/g, ',')
      rows.push(`${iban};${payout.amount.toFixed(2)};${payout.reference};${name}`)
    }

    const csv = rows.join('\r\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=sepa-payouts-${year}-${String(month).padStart(2, '0')}.csv`)
    res.send(csv)
  } catch (err) {
    logger.error(`[payout.exportSepaCsv] ${i18n.t('DB_ERROR')} ${_year}/${_month}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}

/**
 * Stream a payout statement PDF (admin or owning host).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export const getPayoutStatement = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    if (!helper.isValidObjectId(id)) {
      throw new Error('Payout id is not valid')
    }

    const payout = await Payout.findById(id).lean()
    if (!payout || !payout.statementFile) {
      res.sendStatus(204)
      return
    }

    const sessionUser = req.user
    if (!sessionUser || (sessionUser.type !== bookcarsTypes.UserType.Admin && sessionUser._id !== payout.host.toString())) {
      res.status(403).send({ message: 'Forbidden' })
      return
    }

    const filepath = path.join(env.CDN_STATEMENTS, path.basename(payout.statementFile))
    if (!(await helper.pathExists(filepath))) {
      res.sendStatus(204)
      return
    }

    res.sendFile(path.resolve(filepath))
  } catch (err) {
    logger.error(`[payout.getPayoutStatement] ${i18n.t('DB_ERROR')} ${id}`, err)
    res.status(400).send(i18n.t('DB_ERROR') + err)
  }
}
