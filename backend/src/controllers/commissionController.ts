import { Request, Response } from 'express'
import * as bookcarsTypes from ':bookcars-types'
import * as logger from '../utils/logger'
import CommissionTransaction from '../models/CommissionTransaction'
import User from '../models/User'
import Booking from '../models/Booking'
import * as commissionHelper from '../utils/commissionHelper'

/**
 * Calculate commission for a booking.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export async function calculateCommission(req: Request, res: Response) {
  try {
    const { supplierId, bookingAmount, paymentMethod } = req.body

    if (!supplierId || !bookingAmount) {
      return res.status(400).send('Missing required fields')
    }

    const supplier = await User.findById(supplierId)
    if (!supplier || supplier.type !== bookcarsTypes.UserType.Supplier) {
      return res.status(404).send('Supplier not found')
    }

    const calculation = await commissionHelper.calculateCommission(supplier, bookingAmount, paymentMethod)

    return res.json({
      ...calculation,
      breakdown: {
        baseAmount: bookingAmount,
        commission: calculation.platformCommission,
        supplierEarnings: calculation.supplierEarnings,
        pdv: calculation.pdvAmount,
        gatewayFee: calculation.paymentGatewayFee,
        netRevenue: calculation.netRevenue,
      },
    })
  } catch (err) {
    logger.error(`[commission.calculateCommission] ${err}`)
    return res.status(400).send(err)
  }
}

/**
 * Get commission transactions with filters.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export async function getCommissionTransactions(req: Request, res: Response) {
  try {
    const {
      supplierId,
      status,
      dateFrom,
      dateTo,
      page: pageStr,
      limit: limitStr,
    } = req.query as {
      supplierId?: string
      status?: string
      dateFrom?: string
      dateTo?: string
      page?: string
      limit?: string
    }

    const page = Number.parseInt(pageStr || '1', 10)
    const limit = Number.parseInt(limitStr || '10', 10)
    const skip = (page - 1) * limit

    // Build query
    const query: any = {}

    if (supplierId) {
      query.supplier = supplierId
    }

    if (status) {
      query.payoutStatus = status
    }

    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom)
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo)
      }
    }

    const [transactions, totalRecords] = await Promise.all([
      CommissionTransaction
        .find(query)
        .populate('booking')
        .populate('supplier', 'fullName email companyName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommissionTransaction.countDocuments(query),
    ])

    return res.json({
      transactions,
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    })
  } catch (err) {
    logger.error(`[commission.getCommissionTransactions] ${err}`)
    return res.status(400).send(err)
  }
}

/**
 * Get supplier revenue statistics.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export async function getSupplierRevenue(req: Request, res: Response) {
  try {
    const { supplierId } = req.params

    const supplier = await User.findById(supplierId)
    if (!supplier || supplier.type !== bookcarsTypes.UserType.Supplier) {
      return res.status(404).send('Supplier not found')
    }

    // Get current month earnings
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const currentMonthEarnings = await commissionHelper.calculateSupplierEarnings(
      supplierId,
      monthStart,
      now,
    )

    // Get revenue chart data (last 12 months)
    const revenueChart = await getRevenueChartData(supplierId, 12)

    // Get pending transactions count
    const pendingTransactionsCount = await CommissionTransaction.countDocuments({
      supplier: supplierId,
      payoutStatus: 'pending',
    })

    return res.json({
      totalRevenue: supplier.totalRevenue || 0,
      pendingPayout: supplier.pendingPayout || 0,
      lastPayout: supplier.lastPayoutDate,
      currentMonthEarnings,
      currentMonthBookings: supplier.currentMonthBookings || 0,
      commissionRate: supplier.tierCommissionRate || supplier.commissionPercentage || 15,
      tier: supplier.tier || 'basic',
      revenueChart,
      pendingTransactionsCount,
    })
  } catch (err) {
    logger.error(`[commission.getSupplierRevenue] ${err}`)
    return res.status(400).send(err)
  }
}

/**
 * Process payout to supplier (Admin only).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export async function processPayout(req: Request, res: Response) {
  try {
    const { supplierId, amount, transactionIds, payoutMethod, payoutReference } = req.body

    if (!supplierId || !amount || !transactionIds || transactionIds.length === 0) {
      return res.status(400).send('Missing required fields')
    }

    const supplier = await User.findById(supplierId)
    if (!supplier || supplier.type !== bookcarsTypes.UserType.Supplier) {
      return res.status(404).send('Supplier not found')
    }

    // Update commission transactions
    const result = await CommissionTransaction.updateMany(
      {
        _id: { $in: transactionIds },
        supplier: supplierId,
        payoutStatus: 'pending',
      },
      {
        $set: {
          payoutStatus: 'paid',
          payoutDate: new Date(),
          payoutMethod: payoutMethod || 'bank_transfer',
          payoutReference: payoutReference || '',
        },
      },
    )

    // Update supplier's pending payout
    await User.findByIdAndUpdate(supplierId, {
      $inc: { pendingPayout: -amount },
      lastPayoutDate: new Date(),
    })

    return res.json({
      success: true,
      transactionsUpdated: result.modifiedCount,
      amount,
    })
  } catch (err) {
    logger.error(`[commission.processPayout] ${err}`)
    return res.status(400).send(err)
  }
}

/**
 * Update supplier commission settings (Admin only).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export async function updateSupplierCommission(req: Request, res: Response) {
  try {
    const { supplierId } = req.params
    const { commissionType, commissionValue, tier } = req.body

    if (!supplierId || !commissionType || commissionValue === undefined) {
      return res.status(400).send('Missing required fields')
    }

    const updateData: any = {}

    if (commissionType === 'percentage') {
      updateData.commissionType = 'percentage'
      updateData.commissionPercentage = commissionValue
    } else {
      updateData.commissionType = 'flat'
      updateData.commissionFlat = commissionValue
    }

    if (tier) {
      updateData.tier = tier
      updateData.tierCommissionRate = commissionHelper.getTierCommissionRate(tier)
    }

    const supplier = await User.findByIdAndUpdate(
      supplierId,
      { $set: updateData },
      { new: true },
    )

    if (!supplier) {
      return res.status(404).send('Supplier not found')
    }

    return res.json({
      success: true,
      supplier: {
        _id: supplier._id,
        fullName: supplier.fullName,
        commissionType: supplier.commissionType,
        commissionPercentage: supplier.commissionPercentage,
        commissionFlat: supplier.commissionFlat,
        tier: supplier.tier,
        tierCommissionRate: supplier.tierCommissionRate,
      },
    })
  } catch (err) {
    logger.error(`[commission.updateSupplierCommission] ${err}`)
    return res.status(400).send(err)
  }
}

/**
 * Get revenue chart data for supplier.
 *
 * @async
 * @param {string} supplierId
 * @param {number} months
 * @returns {Promise<Array<{ month: string, revenue: number }>>}
 */
async function getRevenueChartData(supplierId: string, months: number): Promise<Array<{ month: string; revenue: number }>> {
  const now = new Date()
  const result: Array<{ month: string; revenue: number }> = []

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)

    const revenue = await commissionHelper.calculateSupplierEarnings(
      supplierId,
      monthStart,
      monthEnd,
    )

    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    result.push({
      month: monthStr,
      revenue: Math.round(revenue * 100) / 100,
    })
  }

  return result
}

/**
 * Get platform statistics (Admin only).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {unknown}
 */
export async function getPlatformStatistics(req: Request, res: Response) {
  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // Total platform revenue (all time)
    const totalRevenueResult = await CommissionTransaction.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$platformCommission' },
          totalNetRevenue: { $sum: '$netRevenue' },
        },
      },
    ])

    // This month's revenue
    const monthRevenueResult = await CommissionTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: monthStart },
        },
      },
      {
        $group: {
          _id: null,
          monthRevenue: { $sum: '$platformCommission' },
          monthNetRevenue: { $sum: '$netRevenue' },
        },
      },
    ])

    // Pending payouts
    const pendingPayoutsResult = await CommissionTransaction.aggregate([
      {
        $match: {
          payoutStatus: 'pending',
        },
      },
      {
        $group: {
          _id: null,
          pendingAmount: { $sum: '$supplierEarnings' },
          pendingCount: { $sum: 1 },
        },
      },
    ])

    // Top suppliers by revenue this month
    const topSuppliers = await CommissionTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: monthStart },
        },
      },
      {
        $group: {
          _id: '$supplier',
          revenue: { $sum: '$supplierEarnings' },
          bookings: { $sum: 1 },
        },
      },
      {
        $sort: { revenue: -1 },
      },
      {
        $limit: 10,
      },
      {
        $lookup: {
          from: 'User',
          localField: '_id',
          foreignField: '_id',
          as: 'supplier',
        },
      },
      {
        $unwind: '$supplier',
      },
      {
        $project: {
          _id: 0,
          supplierId: '$_id',
          supplierName: '$supplier.fullName',
          companyName: '$supplier.companyName',
          revenue: 1,
          bookings: 1,
        },
      },
    ])

    return res.json({
      totalRevenue: totalRevenueResult.length > 0 ? totalRevenueResult[0].totalRevenue : 0,
      totalNetRevenue: totalRevenueResult.length > 0 ? totalRevenueResult[0].totalNetRevenue : 0,
      monthRevenue: monthRevenueResult.length > 0 ? monthRevenueResult[0].monthRevenue : 0,
      monthNetRevenue: monthRevenueResult.length > 0 ? monthRevenueResult[0].monthNetRevenue : 0,
      pendingPayouts: {
        amount: pendingPayoutsResult.length > 0 ? pendingPayoutsResult[0].pendingAmount : 0,
        count: pendingPayoutsResult.length > 0 ? pendingPayoutsResult[0].pendingCount : 0,
      },
      topSuppliers,
    })
  } catch (err) {
    logger.error(`[commission.getPlatformStatistics] ${err}`)
    return res.status(400).send(err)
  }
}
