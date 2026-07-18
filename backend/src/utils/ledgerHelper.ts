import * as bookcarsTypes from ':bookcars-types'
import * as env from '../config/env.config'
import Booking from '../models/Booking'
import Car from '../models/Car'
import CommissionTransaction from '../models/CommissionTransaction'
import Setting from '../models/Setting'
import User from '../models/User'
import * as logger from './logger'

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Resolve the platform commission percentage for a booking owner.
 *
 * Resolution order: per-host override (host.commissionPct), then the legacy
 * per-supplier commissionPercentage (classic suppliers), then the global
 * Setting.platformCommissionPct.
 *
 * @export
 * @async
 * @param {env.User} owner
 * @returns {Promise<number>}
 */
export const resolveCommissionPct = async (owner: env.User): Promise<number> => {
  if (owner.host && owner.host.commissionPct !== undefined && owner.host.commissionPct !== null) {
    return owner.host.commissionPct
  }
  if (!owner.host && owner.commissionPercentage !== undefined && owner.commissionPercentage !== null) {
    return owner.commissionPercentage
  }
  const settings = await Setting.findOne({})
  return settings?.platformCommissionPct ?? 35
}

/**
 * Calculate the payment gateway fee (informational).
 *
 * Stripe: 2.9% + €0.30, PayPal: 3.4% + €0.35.
 *
 * @param {number} amount
 * @param {'stripe' | 'paypal'} gateway
 * @returns {number}
 */
const calculateGatewayFee = (amount: number, gateway: 'stripe' | 'paypal') => {
  if (gateway === 'paypal') {
    return round2((amount * 0.034) + 0.35)
  }
  return round2((amount * 0.029) + 0.30)
}

/**
 * Ensure a ledger entry exists for a paid booking (idempotent — at most one
 * entry per booking, guarded by the unique index on `booking`).
 *
 * Called whenever a booking's payment completes: Stripe payment-intent
 * checkout, Stripe session confirmation, PayPal capture, or an admin marking
 * a pay-later booking as paid. Errors are logged, never thrown — a booking
 * must not fail because of ledger bookkeeping.
 *
 * @export
 * @async
 * @param {string} bookingId
 * @returns {Promise<env.CommissionTransaction | null>}
 */
export const ensureLedgerEntry = async (bookingId: string) => {
  try {
    const existing = await CommissionTransaction.findOne({ booking: bookingId })
    if (existing) {
      // a voided entry becomes pending again if the booking is re-paid
      if (existing.payoutStatus === 'voided') {
        existing.payoutStatus = 'pending'
        await existing.save()
      }
      return existing
    }

    const booking = await Booking.findById(bookingId)
    if (!booking) {
      logger.error(`[ledgerHelper.ensureLedgerEntry] Booking ${bookingId} not found`)
      return null
    }

    const owner = await User.findById(booking.supplier)
    if (!owner) {
      logger.error(`[ledgerHelper.ensureLedgerEntry] Supplier ${booking.supplier} not found`)
      return null
    }

    const car = await Car.findById(booking.car)

    const gross = booking.price
    const commissionPct = await resolveCommissionPct(owner)
    const platformCommission = round2((gross * commissionPct) / 100)
    const supplierEarnings = round2(gross - platformCommission)
    const gateway = booking.paypalOrderId ? 'paypal' : 'stripe'
    const paymentGatewayFee = calculateGatewayFee(gross, gateway)
    const netRevenue = round2(platformCommission - paymentGatewayFee)
    const pdvRate = env.VAT_RATE
    const pdvAmount = round2(platformCommission * (pdvRate / 100))

    const entry = new CommissionTransaction({
      booking: booking._id,
      supplier: owner._id,
      totalBookingAmount: gross,
      supplierEarnings,
      platformCommission,
      commissionType: 'percentage',
      commissionValue: commissionPct,
      paymentGatewayFee,
      netRevenue,
      pdvRate,
      pdvAmount,
      payoutStatus: 'pending',
      hostCar: car?.hostCar || false,
    })
    await entry.save()
    return entry
  } catch (err) {
    logger.error(`[ledgerHelper.ensureLedgerEntry] Error for booking ${bookingId}:`, err)
    return null
  }
}

/**
 * Void the ledger entry of a cancelled booking, unless it was already paid
 * out (paid entries stay — refund handling is a manual admin process).
 *
 * @export
 * @async
 * @param {string} bookingId
 * @returns {Promise<void>}
 */
export const voidLedgerEntry = async (bookingId: string) => {
  try {
    await CommissionTransaction.updateOne(
      { booking: bookingId, payoutStatus: { $in: ['pending', 'processing'] } },
      { $set: { payoutStatus: 'voided' } },
    )
  } catch (err) {
    logger.error(`[ledgerHelper.voidLedgerEntry] Error for booking ${bookingId}:`, err)
  }
}

/**
 * Apply a booking status transition to the ledger.
 *
 * @export
 * @async
 * @param {string} bookingId
 * @param {bookcarsTypes.BookingStatus | undefined} previousStatus
 * @param {bookcarsTypes.BookingStatus} newStatus
 * @returns {Promise<void>}
 */
export const onBookingStatusChange = async (
  bookingId: string,
  previousStatus: bookcarsTypes.BookingStatus | undefined,
  newStatus: bookcarsTypes.BookingStatus,
) => {
  if (previousStatus === newStatus) {
    return
  }
  if ([bookcarsTypes.BookingStatus.Paid, bookcarsTypes.BookingStatus.PaidInFull].includes(newStatus)) {
    await ensureLedgerEntry(bookingId)
  } else if ([bookcarsTypes.BookingStatus.Cancelled, bookcarsTypes.BookingStatus.Void].includes(newStatus)) {
    await voidLedgerEntry(bookingId)
  }
}
