import { Request, Response } from 'express'
import strings from '../config/app.config'
import * as analyticsHelper from '../utils/analyticsHelper'
import Booking from '../models/Booking'
import Car from '../models/Car'
import User from '../models/User'
import * as bookcarsTypes from ':bookcars-types'
import { Types } from 'mongoose'

/**
 * Get analytics overview.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const getOverview = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, supplierId } = req.query

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate as string) : new Date()

    const overview = await analyticsHelper.getAnalyticsOverview(
      start,
      end,
      supplierId as string | undefined,
    )

    return res.json(overview)
  } catch (err) {
    console.error(`[analytics.getOverview] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Get revenue analytics.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const getRevenueAnalytics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, supplierId, groupBy } = req.query

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate as string) : new Date()
    const group = (groupBy as string) || 'day'

    const matchQuery: any = {
      createdAt: {
        $gte: start,
        $lte: end,
      },
      status: bookcarsTypes.BookingStatus.Paid,
    }

    if (supplierId) {
      matchQuery.supplier = new Types.ObjectId(supplierId as string)
    }

    let dateFormat: string
    switch (group) {
      case 'week':
        dateFormat = '%Y-%U'
        break
      case 'month':
        dateFormat = '%Y-%m'
        break
      case 'year':
        dateFormat = '%Y'
        break
      default:
        dateFormat = '%Y-%m-%d'
    }

    const revenue = await Booking.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          revenue: { $sum: '$price' },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: '$_id',
          revenue: 1,
          bookings: 1,
          _id: 0,
        },
      },
    ])

    return res.json({ revenue })
  } catch (err) {
    console.error(`[analytics.getRevenueAnalytics] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Get booking analytics.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const getBookingAnalytics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, supplierId } = req.query

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate as string) : new Date()

    const matchQuery: any = {
      createdAt: {
        $gte: start,
        $lte: end,
      },
    }

    if (supplierId) {
      matchQuery.supplier = new Types.ObjectId(supplierId as string)
    }

    // Booking status distribution
    const statusDistribution = await Booking.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ])

    // Booking duration distribution
    const durationDistribution = await Booking.aggregate([
      { $match: matchQuery },
      {
        $project: {
          duration: {
            $divide: [{ $subtract: ['$to', '$from'] }, 1000 * 60 * 60 * 24],
          },
        },
      },
      {
        $bucket: {
          groupBy: '$duration',
          boundaries: [0, 1, 3, 7, 14, 30, 60],
          default: '60+',
          output: {
            count: { $sum: 1 },
          },
        },
      },
    ])

    // Bookings by day of week
    const byDayOfWeek = await Booking.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    // Bookings by hour
    const byHour = await Booking.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    return res.json({
      statusDistribution,
      durationDistribution,
      byDayOfWeek,
      byHour,
    })
  } catch (err) {
    console.error(`[analytics.getBookingAnalytics] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Get vehicle analytics.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const getVehicleAnalytics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, supplierId } = req.query

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate as string) : new Date()

    // Get vehicle utilization
    const utilization = await analyticsHelper.getVehicleUtilization(
      start,
      end,
      supplierId as string | undefined,
    )

    // Get top vehicles
    const topVehicles = await analyticsHelper.getTopVehicles(
      start,
      end,
      10,
      supplierId as string | undefined,
    )

    // Get revenue by vehicle type
    const matchQuery: any = {
      createdAt: {
        $gte: start,
        $lte: end,
      },
      status: bookcarsTypes.BookingStatus.Paid,
    }

    if (supplierId) {
      matchQuery.supplier = new Types.ObjectId(supplierId as string)
    }

    const revenueByType = await Booking.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'Car',
          localField: 'car',
          foreignField: '_id',
          as: 'carDetails',
        },
      },
      { $unwind: '$carDetails' },
      {
        $group: {
          _id: '$carDetails.type',
          revenue: { $sum: '$price' },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      {
        $project: {
          type: '$_id',
          revenue: 1,
          bookings: 1,
          _id: 0,
        },
      },
    ])

    return res.json({
      utilization,
      topVehicles,
      revenueByType,
    })
  } catch (err) {
    console.error(`[analytics.getVehicleAnalytics] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Get customer analytics.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const getCustomerAnalytics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate as string) : new Date()

    // New customers trend
    const newCustomers = await User.aggregate([
      {
        $match: {
          type: bookcarsTypes.UserType.User,
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: '$_id',
          count: 1,
          _id: 0,
        },
      },
    ])

    // Repeat customer rate
    const repeatCustomers = await Booking.aggregate([
      {
        $match: {
          createdAt: {
            $lte: end,
          },
          status: bookcarsTypes.BookingStatus.Paid,
        },
      },
      {
        $group: {
          _id: '$renter',
          bookings: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          repeatCustomers: {
            $sum: {
              $cond: [{ $gt: ['$bookings', 1] }, 1, 0],
            },
          },
        },
      },
    ])

    // Customer lifetime value
    const customerLTV = await Booking.aggregate([
      {
        $match: {
          status: bookcarsTypes.BookingStatus.Paid,
        },
      },
      {
        $group: {
          _id: '$renter',
          totalSpent: { $sum: '$price' },
          bookings: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          avgLifetimeValue: { $avg: '$totalSpent' },
          avgBookingsPerCustomer: { $avg: '$bookings' },
        },
      },
    ])

    const repeatRate = repeatCustomers.length > 0
      ? (repeatCustomers[0].repeatCustomers / repeatCustomers[0].totalCustomers) * 100
      : 0

    return res.json({
      newCustomers,
      repeatCustomerRate: Math.round(repeatRate * 10) / 10,
      avgLifetimeValue: customerLTV[0]?.avgLifetimeValue || 0,
      avgBookingsPerCustomer: Math.round((customerLTV[0]?.avgBookingsPerCustomer || 0) * 10) / 10,
    })
  } catch (err) {
    console.error(`[analytics.getCustomerAnalytics] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Get supplier analytics (Admin only).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const getSupplierAnalytics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate as string) : new Date()

    const supplierPerformance = await Booking.aggregate([
      {
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
          status: bookcarsTypes.BookingStatus.Paid,
        },
      },
      {
        $group: {
          _id: '$supplier',
          revenue: { $sum: '$price' },
          bookings: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'User',
          localField: '_id',
          foreignField: '_id',
          as: 'supplierDetails',
        },
      },
      { $unwind: '$supplierDetails' },
      {
        $lookup: {
          from: 'CommissionTransaction',
          let: { supplierId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$supplier', '$$supplierId'] },
                    { $gte: ['$createdAt', start] },
                    { $lte: ['$createdAt', end] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalCommission: { $sum: '$platformCommission' },
              },
            },
          ],
          as: 'commission',
        },
      },
      { $sort: { revenue: -1 } },
      {
        $project: {
          supplierId: '$_id',
          supplierName: '$supplierDetails.fullName',
          revenue: 1,
          bookings: 1,
          commission: { $ifNull: [{ $first: '$commission.totalCommission' }, 0] },
          avgRating: '$supplierDetails.averageRating',
          _id: 0,
        },
      },
    ])

    return res.json({ suppliers: supplierPerformance })
  } catch (err) {
    console.error(`[analytics.getSupplierAnalytics] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Generate daily summary (cron job).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const generateDailySummary = async (req: Request, res: Response) => {
  try {
    const { date } = req.query
    const targetDate = date ? new Date(date as string) : new Date(Date.now() - 24 * 60 * 60 * 1000)

    await analyticsHelper.generateDailySummary(targetDate)

    return res.json({ success: true, message: 'Daily summary generated successfully' })
  } catch (err) {
    console.error(`[analytics.generateDailySummary] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}
