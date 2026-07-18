import * as env from '../config/env.config'

/**
 * Server-side booking price calculation (P2P hardening).
 *
 * Mirrors packages/bookcars-helper `calculateTotalPrice` so the backend can
 * verify the client-sent booking price instead of trusting it — required once
 * third parties (hosts) are paid a share of it.
 */

const _days = (from?: Date, to?: Date): number =>
  (from && to && Math.ceil((to.getTime() - from.getTime()) / (1000 * 3600 * 24))) || 0

const _hours = (from?: Date, to?: Date): number =>
  (from && to && Math.ceil((to.getTime() - from.getTime()) / (1000 * 3600))) || 0

export interface BookingOptions {
  cancellation?: boolean
  amendments?: boolean
  theftProtection?: boolean
  collisionDamageWaiver?: boolean
  fullInsurance?: boolean
  additionalDriver?: boolean
}

/**
 * Calculate the total booking price of a car for a rental period.
 *
 * @export
 * @param {env.Car} car
 * @param {env.DateBasedPrice[]} dateBasedPrices
 * @param {Date} from
 * @param {Date} to
 * @param {number} priceChangeRate
 * @param {?BookingOptions} [options]
 * @returns {number}
 */
export const calculateTotalPrice = (
  car: env.Car,
  dateBasedPrices: env.DateBasedPrice[],
  from: Date,
  to: Date,
  priceChangeRate: number,
  options?: BookingOptions,
): number => {
  let totalPrice = 0
  let totalDays = _days(from, to)

  if (car.isDateBasedPrice) {
    const currentDate = new Date(from)
    currentDate.setHours(0, 0, 0, 0)

    let currentDay = 1
    while (currentDay <= totalDays) {
      let applicableRate = (car.discountedDailyPrice || car.dailyPrice)

      for (const dateBasedPrice of dateBasedPrices) {
        const _startDate = new Date(dateBasedPrice.startDate)
        _startDate.setHours(0, 0, 0, 0)
        const _endDate = new Date(dateBasedPrice.endDate)
        _endDate.setHours(0, 0, 0, 0)

        if (currentDate.getTime() >= _startDate.getTime() && currentDate.getTime() <= _endDate.getTime()) {
          applicableRate = Number(dateBasedPrice.dailyPrice)
          break
        }
      }

      totalPrice += applicableRate
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate.setHours(0, 0, 0, 0)
      currentDay += 1
    }
  } else {
    const totalHours = _hours(from, to)
    totalDays = Math.floor(totalHours / 24)
    const remainingHours = totalHours % 24

    let remainingDays = totalDays

    if (remainingDays >= 30) {
      if (car.discountedMonthlyPrice || car.monthlyPrice) {
        totalPrice += (car.discountedMonthlyPrice || car.monthlyPrice)! * Math.floor(remainingDays / 30)
        remainingDays %= 30
      }
    }

    if (remainingDays >= 7) {
      if (car.discountedWeeklyPrice || car.weeklyPrice) {
        totalPrice += (car.discountedWeeklyPrice || car.weeklyPrice)! * Math.floor(remainingDays / 7)
        remainingDays %= 7
      }
    }

    if (remainingDays >= 3) {
      if (car.discountedBiWeeklyPrice || car.biWeeklyPrice) {
        totalPrice += (car.discountedBiWeeklyPrice || car.biWeeklyPrice)! * Math.floor(remainingDays / 3)
        remainingDays %= 3
      }
    }

    if (remainingDays > 0) {
      totalPrice += (car.discountedDailyPrice || car.dailyPrice) * remainingDays
    }

    if (totalDays === 0 || remainingHours > 0) {
      const hourlyRate = car.discountedHourlyPrice || car.hourlyPrice
      if (hourlyRate) {
        totalPrice += hourlyRate * remainingHours
      } else if (car.dailyPrice || car.discountedDailyPrice) {
        totalPrice += (car.discountedDailyPrice || car.dailyPrice)
      }
    }
  }

  if (options) {
    if (options.cancellation && car.cancellation > 0) {
      totalPrice += car.cancellation
    }
    if (options.amendments && car.amendments > 0) {
      totalPrice += car.amendments
    }
    if (options.theftProtection && car.theftProtection > 0) {
      totalPrice += car.theftProtection * totalDays
    }
    if (options.collisionDamageWaiver && car.collisionDamageWaiver > 0) {
      totalPrice += car.collisionDamageWaiver * totalDays
    }
    if (options.fullInsurance && car.fullInsurance > 0) {
      totalPrice += car.fullInsurance * totalDays
    }
    if (options.additionalDriver && car.additionalDriver > 0) {
      totalPrice += car.additionalDriver * totalDays
    }
  }

  totalPrice += totalPrice * (priceChangeRate / 100)

  return totalPrice
}

/**
 * Check whether a client-sent price matches the server-side calculation
 * within tolerance (small drift is expected from display-currency
 * conversion roundtrips).
 *
 * @export
 * @param {number} clientPrice
 * @param {number} expectedPrice
 * @returns {boolean}
 */
export const priceMatches = (clientPrice: number, expectedPrice: number): boolean => {
  const tolerance = Math.max(1, expectedPrice * 0.02)
  return Math.abs(clientPrice - expectedPrice) <= tolerance
}
