import Booking from '../models/Booking'
import Car from '../models/Car'
import User from '../models/User'
import CommissionTransaction from '../models/CommissionTransaction'
import AnalyticsSummary from '../models/AnalyticsSummary'
import * as bookcarsTypes from ':bookcars-types'
import { Types } from 'mongoose'

/**
 * Generate daily analytics summary.
 *
 * @async
 * @param {Date} date
 * @returns {Promise<void>}
 */
export const generateDailySummary = async (date: Date): Promise<void> => {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  // Get bookings for the day
  const bookings = await Booking.find({
    createdAt: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  }).populate('car').populate('supplier')

  // Calculate metrics
  const totalBookings = bookings.length
  const confirmedBookings = bookings.filter((b) => b.status === bookcarsTypes.BookingStatus.Reserved).length
  const paidBookings = bookings.filter((b) => b.status === bookcarsTypes.BookingStatus.Paid).length
  const cancelledBookings = bookings.filter((b) => b.status === bookcarsTypes.BookingStatus.Cancelled).length

  // Calculate revenue
  let totalRevenue = 0
  let platformCommission = 0
  let supplierEarnings = 0

  const supplierMap = new Map<string, { revenue: number; bookings: number; commission: number }>()
  const locationMap = new Map<string, { bookings: number; revenue: number }>()
  const vehicleTypeMap = new Map<string, { bookings: number; revenue: number }>()

  for (const booking of bookings) {
    if (booking.status === bookcarsTypes.BookingStatus.Paid) {
      const price = booking.price || 0
      totalRevenue += price

      // Get commission transaction
      const commission = await CommissionTransaction.findOne({ booking: booking._id })
      if (commission) {
        platformCommission += commission.platformCommission
        supplierEarnings += commission.supplierEarnings
      }

      // Supplier breakdown
      const supplierId = booking.supplier.toString()
      if (!supplierMap.has(supplierId)) {
        supplierMap.set(supplierId, { revenue: 0, bookings: 0, commission: 0 })
      }
      const supplierData = supplierMap.get(supplierId)!
      supplierData.revenue += price
      supplierData.bookings += 1
      if (commission) {
        supplierData.commission += commission.platformCommission
      }

      // Location breakdown
      const pickupLocationId = booking.pickupLocation.toString()
      if (!locationMap.has(pickupLocationId)) {
        locationMap.set(pickupLocationId, { bookings: 0, revenue: 0 })
      }
      const locationData = locationMap.get(pickupLocationId)!
      locationData.bookings += 1
      locationData.revenue += price

      // Vehicle type breakdown
      const car = booking.car as any
      if (car && car.type) {
        const vehicleType = car.type
        if (!vehicleTypeMap.has(vehicleType)) {
          vehicleTypeMap.set(vehicleType, { bookings: 0, revenue: 0 })
        }
        const vehicleTypeData = vehicleTypeMap.get(vehicleType)!
        vehicleTypeData.bookings += 1
        vehicleTypeData.revenue += price
      }
    }
  }

  // Get customer metrics
  const allCustomers = await User.find({ type: bookcarsTypes.UserType.User })
  const newCustomers = await User.find({
    type: bookcarsTypes.UserType.User,
    createdAt: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  })

  // Get repeat customers (users with more than one booking)
  const repeatCustomersCount = await Booking.aggregate([
    {
      $match: {
        createdAt: {
          $lte: endOfDay,
        },
        status: bookcarsTypes.BookingStatus.Paid,
      },
    },
    {
      $group: {
        _id: '$renter',
        count: { $sum: 1 },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
      },
    },
    {
      $count: 'total',
    },
  ])

  // Get vehicle metrics
  const totalVehicles = await Car.countDocuments({ available: true })
  const bookedVehicles = await Booking.distinct('car', {
    from: { $lte: endOfDay },
    to: { $gte: startOfDay },
    status: { $in: [bookcarsTypes.BookingStatus.Reserved, bookcarsTypes.BookingStatus.Paid] },
  })

  // Build breakdowns
  const bySupplier = Array.from(supplierMap.entries()).map(([supplierId, data]) => ({
    supplier: new Types.ObjectId(supplierId),
    revenue: data.revenue,
    bookings: data.bookings,
    commission: data.commission,
  }))

  const byLocation = Array.from(locationMap.entries()).map(([locationId, data]) => ({
    location: new Types.ObjectId(locationId),
    bookings: data.bookings,
    revenue: data.revenue,
  }))

  const byVehicleType = Array.from(vehicleTypeMap.entries()).map(([type, data]) => ({
    type,
    bookings: data.bookings,
    revenue: data.revenue,
  }))

  // Save or update summary
  await AnalyticsSummary.findOneAndUpdate(
    { date: startOfDay, type: 'daily' },
    {
      date: startOfDay,
      type: 'daily',
      totalRevenue,
      platformCommission,
      supplierEarnings,
      totalBookings,
      confirmedBookings,
      paidBookings,
      cancelledBookings,
      totalCustomers: allCustomers.length,
      newCustomers: newCustomers.length,
      repeatCustomers: repeatCustomersCount[0]?.total || 0,
      totalVehicles,
      availableVehicles: totalVehicles - bookedVehicles.length,
      bookedVehicles: bookedVehicles.length,
      bySupplier,
      byLocation,
      byVehicleType,
    },
    { upsert: true, new: true },
  )
}

/**
 * Get analytics overview for a date range.
 *
 * @async
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {string} [supplierId]
 * @returns {Promise<any>}
 */
export const getAnalyticsOverview = async (
  startDate: Date,
  endDate: Date,
  supplierId?: string,
): Promise<any> => {
  const summaries = await AnalyticsSummary.find({
    date: {
      $gte: startDate,
      $lte: endDate,
    },
    type: 'daily',
  }).sort({ date: 1 })

  let totalRevenue = 0
  let totalBookings = 0
  let platformCommission = 0
  let supplierEarnings = 0
  const revenueTrend: Array<{ date: string; revenue: number }> = []
  const bookingStatus = {
    confirmed: 0,
    paid: 0,
    cancelled: 0,
  }

  for (const summary of summaries) {
    if (supplierId) {
      // Filter by supplier
      const supplierData = summary.bySupplier.find((s) => s.supplier.toString() === supplierId)
      if (supplierData) {
        totalRevenue += supplierData.revenue
        totalBookings += supplierData.bookings
        platformCommission += supplierData.commission
        supplierEarnings += supplierData.revenue - supplierData.commission
      }
    } else {
      totalRevenue += summary.totalRevenue
      totalBookings += summary.totalBookings
      platformCommission += summary.platformCommission
      supplierEarnings += summary.supplierEarnings
      bookingStatus.confirmed += summary.confirmedBookings
      bookingStatus.paid += summary.paidBookings
      bookingStatus.cancelled += summary.cancelledBookings
    }

    revenueTrend.push({
      date: summary.date.toISOString().split('T')[0],
      revenue: supplierId
        ? summary.bySupplier.find((s) => s.supplier.toString() === supplierId)?.revenue || 0
        : summary.totalRevenue,
    })
  }

  // Get total customers and vehicles
  const totalCustomers = await User.countDocuments({ type: bookcarsTypes.UserType.User })
  const totalVehicles = supplierId
    ? await Car.countDocuments({ supplier: supplierId, available: true })
    : await Car.countDocuments({ available: true })

  return {
    kpis: {
      totalRevenue,
      totalBookings,
      totalCustomers,
      totalVehicles,
      platformCommission,
      supplierEarnings,
    },
    revenueTrend,
    bookingStatus,
  }
}

/**
 * Get vehicle utilization analytics.
 *
 * @async
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {string} [supplierId]
 * @returns {Promise<any>}
 */
export const getVehicleUtilization = async (
  startDate: Date,
  endDate: Date,
  supplierId?: string,
): Promise<any> => {
  const query: any = { available: true }
  if (supplierId) {
    query.supplier = supplierId
  }

  const vehicles = await Car.find(query).populate('supplier')

  const utilization = []
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  for (const vehicle of vehicles) {
    const bookings = await Booking.find({
      car: vehicle._id,
      status: { $in: [bookcarsTypes.BookingStatus.Reserved, bookcarsTypes.BookingStatus.Paid] },
      from: { $lte: endDate },
      to: { $gte: startDate },
    })

    let bookedDays = 0
    for (const booking of bookings) {
      const bookingStart = booking.from > startDate ? booking.from : startDate
      const bookingEnd = booking.to < endDate ? booking.to : endDate
      const days = Math.ceil((bookingEnd.getTime() - bookingStart.getTime()) / (1000 * 60 * 60 * 24))
      bookedDays += days
    }

    const utilizationRate = (bookedDays / totalDays) * 100

    utilization.push({
      vehicleId: vehicle._id,
      vehicleName: vehicle.name,
      supplier: (vehicle.supplier as any).fullName,
      utilizationRate: Math.round(utilizationRate * 10) / 10,
      bookedDays,
      totalDays,
    })
  }

  return utilization.sort((a, b) => b.utilizationRate - a.utilizationRate)
}

/**
 * Get top performing vehicles.
 *
 * @async
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {number} limit
 * @param {string} [supplierId]
 * @returns {Promise<any[]>}
 */
export const getTopVehicles = async (
  startDate: Date,
  endDate: Date,
  limit: number = 10,
  supplierId?: string,
): Promise<any[]> => {
  const matchQuery: any = {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
    status: bookcarsTypes.BookingStatus.Paid,
  }

  if (supplierId) {
    matchQuery.supplier = new Types.ObjectId(supplierId)
  }

  const topVehicles = await Booking.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$car',
        bookings: { $sum: 1 },
        revenue: { $sum: '$price' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'Car',
        localField: '_id',
        foreignField: '_id',
        as: 'carDetails',
      },
    },
    { $unwind: '$carDetails' },
    {
      $project: {
        vehicleId: '$_id',
        vehicleName: '$carDetails.name',
        bookings: 1,
        revenue: 1,
      },
    },
  ])

  return topVehicles
}
