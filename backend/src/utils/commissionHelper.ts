import * as bookcarsTypes from ':bookcars-types'
import * as env from '../config/env.config'
import User from '../models/User'

/**
 * Calculate commission for a booking.
 *
 * @export
 * @async
 * @param {env.User} supplier
 * @param {number} bookingAmount
 * @param {string} [paymentMethod='stripe']
 * @returns {Promise<CommissionCalculation>}
 */
export async function calculateCommission(
  supplier: env.User,
  bookingAmount: number,
  paymentMethod: string = 'stripe',
): Promise<CommissionCalculation> {
  const commissionType = supplier.commissionType || 'percentage'
  const commissionRate = supplier.tierCommissionRate || supplier.commissionPercentage || 15

  let platformCommission: number

  if (commissionType === 'percentage') {
    platformCommission = (bookingAmount * commissionRate) / 100
  } else {
    // Flat commission
    platformCommission = supplier.commissionFlat || 0
  }

  // Round to 2 decimal places
  platformCommission = Math.round(platformCommission * 100) / 100

  // Calculate payment gateway fees
  const paymentGatewayFee = calculatePaymentGatewayFee(bookingAmount, paymentMethod)

  // Supplier earnings = Total - Commission
  const supplierEarnings = Math.round((bookingAmount - platformCommission) * 100) / 100

  // Net revenue = Commission - Gateway Fees
  const netRevenue = Math.round((platformCommission - paymentGatewayFee) * 100) / 100

  // Croatian PDV (VAT) on commission
  const pdvRate = 25 // 25%
  const pdvAmount = Math.round((platformCommission * (pdvRate / 100)) * 100) / 100

  return {
    supplierEarnings,
    platformCommission,
    commissionType,
    commissionRate,
    paymentGatewayFee,
    netRevenue,
    pdvRate,
    pdvAmount,
  }
}

/**
 * Calculate payment gateway fees.
 *
 * Stripe: 2.9% + €0.30 per transaction
 * PayPal: 3.4% + €0.35 per transaction
 *
 * @param {number} amount
 * @param {string} [paymentMethod='stripe']
 * @returns {number}
 */
function calculatePaymentGatewayFee(amount: number, paymentMethod: string = 'stripe'): number {
  let fee: number

  if (paymentMethod === 'paypal') {
    // PayPal: 3.4% + €0.35
    fee = (amount * 0.034) + 0.35
  } else {
    // Stripe: 2.9% + €0.30
    fee = (amount * 0.029) + 0.30
  }

  return Math.round(fee * 100) / 100
}

/**
 * Get commission rate based on tier.
 *
 * @export
 * @param {string} tier
 * @returns {number}
 */
export function getTierCommissionRate(tier: string): number {
  switch (tier) {
    case 'gold':
      return 10
    case 'silver':
      return 12
    case 'basic':
    default:
      return 15
  }
}

/**
 * Check if supplier should be upgraded to a higher tier.
 *
 * Tier rules:
 * - Basic: 0-10 bookings/month, 15% commission
 * - Silver: 11-30 bookings/month, 12% commission
 * - Gold: 31+ bookings/month, 10% commission
 *
 * @export
 * @async
 * @param {string} supplierId
 * @returns {Promise<TierUpgrade | null>}
 */
export async function checkTierUpgrade(supplierId: string): Promise<TierUpgrade | null> {
  const supplier = await User.findById(supplierId)
  if (!supplier || supplier.type !== bookcarsTypes.UserType.Supplier) {
    return null
  }

  const currentTier = supplier.tier || 'basic'
  const bookings = supplier.currentMonthBookings || 0

  let newTier: string | null = null

  if (bookings >= 31 && currentTier !== 'gold') {
    newTier = 'gold'
  } else if (bookings >= 11 && bookings < 31 && currentTier === 'basic') {
    newTier = 'silver'
  }

  if (newTier) {
    return {
      supplierId,
      oldTier: currentTier,
      newTier,
      newCommissionRate: getTierCommissionRate(newTier),
      bookingsThisMonth: bookings,
    }
  }

  return null
}

/**
 * Generate invoice number.
 *
 * Format: INV-YYYYMMDD-XXXXX
 * Example: INV-20241224-00001
 *
 * @export
 * @async
 * @returns {Promise<string>}
 */
export async function generateInvoiceNumber(): Promise<string> {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const dateStr = `${year}${month}${day}`

  // Get the count of invoices created today
  const CommissionTransaction = (await import('../models/CommissionTransaction')).default
  const todayStart = new Date(date.setHours(0, 0, 0, 0))
  const count = await CommissionTransaction.countDocuments({
    createdAt: { $gte: todayStart },
  })

  const sequence = String(count + 1).padStart(5, '0')

  return `INV-${dateStr}-${sequence}`
}

/**
 * Calculate total supplier earnings for a date range.
 *
 * @export
 * @async
 * @param {string} supplierId
 * @param {Date} fromDate
 * @param {Date} toDate
 * @returns {Promise<number>}
 */
export async function calculateSupplierEarnings(
  supplierId: string,
  fromDate: Date,
  toDate: Date,
): Promise<number> {
  const CommissionTransaction = (await import('../models/CommissionTransaction')).default

  const result = await CommissionTransaction.aggregate([
    {
      $match: {
        supplier: supplierId,
        createdAt: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$supplierEarnings' },
      },
    },
  ])

  return result.length > 0 ? result[0].totalEarnings : 0
}

/**
 * CommissionCalculation interface.
 *
 * @export
 * @interface CommissionCalculation
 * @typedef {CommissionCalculation}
 */
export interface CommissionCalculation {
  supplierEarnings: number
  platformCommission: number
  commissionType: string
  commissionRate: number
  paymentGatewayFee: number
  netRevenue: number
  pdvRate: number
  pdvAmount: number
}

/**
 * TierUpgrade interface.
 *
 * @export
 * @interface TierUpgrade
 * @typedef {TierUpgrade}
 */
export interface TierUpgrade {
  supplierId: string
  oldTier: string
  newTier: string
  newCommissionRate: number
  bookingsThisMonth: number
}
