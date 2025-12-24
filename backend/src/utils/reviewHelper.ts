import Review from '../models/Review'
import ReviewHelpful from '../models/ReviewHelpful'
import Car from '../models/Car'
import User from '../models/User'
import Booking from '../models/Booking'
import * as bookcarsTypes from ':bookcars-types'
import { Types } from 'mongoose'

/**
 * Calculate average rating from array of ratings.
 *
 * @param {number[]} ratings
 * @returns {number}
 */
export const calculateAverage = (ratings: number[]): number => {
  if (ratings.length === 0) {
    return 0
  }
  const sum = ratings.reduce((acc, rating) => acc + rating, 0)
  return Math.round((sum / ratings.length) * 10) / 10 // Round to 1 decimal
}

/**
 * Update car rating statistics.
 *
 * @async
 * @param {string} carId
 * @returns {Promise<void>}
 */
export const updateCarRatings = async (carId: string): Promise<void> => {
  const reviews = await Review.find({
    car: new Types.ObjectId(carId),
    status: 'approved',
  })

  if (reviews.length === 0) {
    await Car.updateOne(
      { _id: carId },
      {
        averageRating: 0,
        reviewCount: 0,
        ratingBreakdown: {
          vehicleCondition: 0,
          valueForMoney: 0,
          customerService: 0,
          pickupDropoff: 0,
        },
      },
    )
    return
  }

  const overallRatings = reviews.map((r) => r.overallRating)
  const vehicleConditionRatings = reviews.map((r) => r.vehicleConditionRating)
  const valueForMoneyRatings = reviews.map((r) => r.valueForMoneyRating)
  const customerServiceRatings = reviews.map((r) => r.customerServiceRating)
  const pickupDropoffRatings = reviews.map((r) => r.pickupDropoffRating)

  await Car.updateOne(
    { _id: carId },
    {
      averageRating: calculateAverage(overallRatings),
      reviewCount: reviews.length,
      ratingBreakdown: {
        vehicleCondition: calculateAverage(vehicleConditionRatings),
        valueForMoney: calculateAverage(valueForMoneyRatings),
        customerService: calculateAverage(customerServiceRatings),
        pickupDropoff: calculateAverage(pickupDropoffRatings),
      },
    },
  )
}

/**
 * Update supplier rating statistics.
 *
 * @async
 * @param {string} supplierId
 * @returns {Promise<void>}
 */
export const updateSupplierRatings = async (supplierId: string): Promise<void> => {
  const reviews = await Review.find({
    supplier: new Types.ObjectId(supplierId),
    status: 'approved',
  })

  if (reviews.length === 0) {
    await User.updateOne(
      { _id: supplierId },
      {
        averageRating: 0,
        reviewCount: 0,
        responseRate: 0,
        averageResponseTime: 0,
      },
    )
    return
  }

  const overallRatings = reviews.map((r) => r.overallRating)
  const averageRating = calculateAverage(overallRatings)

  // Calculate response rate
  const reviewsWithResponse = reviews.filter((r) => r.supplierResponse?.text)
  const responseRate = Math.round((reviewsWithResponse.length / reviews.length) * 100)

  // Calculate average response time (in hours)
  let totalResponseTimeHours = 0
  let responseCount = 0

  for (const review of reviewsWithResponse) {
    if (review.supplierResponse?.respondedAt) {
      const reviewCreatedAt = review.createdAt?.getTime() || 0
      const respondedAt = review.supplierResponse.respondedAt.getTime()
      const diffHours = (respondedAt - reviewCreatedAt) / (1000 * 60 * 60)
      totalResponseTimeHours += diffHours
      responseCount++
    }
  }

  const averageResponseTime = responseCount > 0
    ? Math.round(totalResponseTimeHours / responseCount)
    : 0

  await User.updateOne(
    { _id: supplierId },
    {
      averageRating,
      reviewCount: reviews.length,
      responseRate,
      averageResponseTime,
    },
  )
}

/**
 * Check if user can review a booking.
 *
 * @async
 * @param {string} bookingId
 * @param {string} userId
 * @returns {Promise<{ canReview: boolean; reason?: string }>}
 */
export const canReviewBooking = async (
  bookingId: string,
  userId: string,
): Promise<{ canReview: boolean; reason?: string }> => {
  // Check if booking exists
  const booking = await Booking.findById(bookingId)
  if (!booking) {
    return { canReview: false, reason: 'Booking not found' }
  }

  // Check if user is the renter
  if (booking.renter?.toString() !== userId) {
    return { canReview: false, reason: 'Only the renter can review this booking' }
  }

  // Check if booking is completed
  if (booking.status !== bookcarsTypes.BookingStatus.Paid) {
    return { canReview: false, reason: 'Booking must be completed to review' }
  }

  // Check if booking dropoff date has passed
  const now = new Date()
  const dropOffDate = new Date(booking.to)
  if (dropOffDate > now) {
    return { canReview: false, reason: 'Cannot review before booking completion' }
  }

  // Check if review already exists
  const existingReview = await Review.findOne({ booking: new Types.ObjectId(bookingId) })
  if (existingReview) {
    return { canReview: false, reason: 'Review already submitted for this booking' }
  }

  return { canReview: true }
}

/**
 * Get rating distribution for a car.
 *
 * @async
 * @param {string} carId
 * @returns {Promise<Record<string, number>>}
 */
export const getRatingDistribution = async (carId: string): Promise<Record<string, number>> => {
  const reviews = await Review.find({
    car: new Types.ObjectId(carId),
    status: 'approved',
  })

  const distribution: Record<string, number> = {
    '5': 0,
    '4': 0,
    '3': 0,
    '2': 0,
    '1': 0,
  }

  for (const review of reviews) {
    const rating = Math.floor(review.overallRating).toString()
    distribution[rating] = (distribution[rating] || 0) + 1
  }

  return distribution
}

/**
 * Validate review content.
 *
 * @param {string} title
 * @param {string} comment
 * @returns {{ valid: boolean; errors: string[] }}
 */
export const validateReviewContent = (
  title: string,
  comment: string,
): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!title || title.trim().length === 0) {
    errors.push('Review title is required')
  } else if (title.length > 100) {
    errors.push('Review title must be 100 characters or less')
  }

  if (!comment || comment.trim().length === 0) {
    errors.push('Review comment is required')
  } else if (comment.length < 10) {
    errors.push('Review comment must be at least 10 characters')
  } else if (comment.length > 2000) {
    errors.push('Review comment must be 2000 characters or less')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate ratings.
 *
 * @param {number} overallRating
 * @param {number} vehicleConditionRating
 * @param {number} valueForMoneyRating
 * @param {number} customerServiceRating
 * @param {number} pickupDropoffRating
 * @returns {{ valid: boolean; errors: string[] }}
 */
export const validateRatings = (
  overallRating: number,
  vehicleConditionRating: number,
  valueForMoneyRating: number,
  customerServiceRating: number,
  pickupDropoffRating: number,
): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  const ratings = [
    { name: 'Overall rating', value: overallRating },
    { name: 'Vehicle condition rating', value: vehicleConditionRating },
    { name: 'Value for money rating', value: valueForMoneyRating },
    { name: 'Customer service rating', value: customerServiceRating },
    { name: 'Pickup/dropoff rating', value: pickupDropoffRating },
  ]

  for (const rating of ratings) {
    if (typeof rating.value !== 'number') {
      errors.push(`${rating.name} must be a number`)
    } else if (rating.value < 1 || rating.value > 5) {
      errors.push(`${rating.name} must be between 1 and 5`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Check if user has already voted on review.
 *
 * @async
 * @param {string} reviewId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const hasUserVoted = async (reviewId: string, userId: string): Promise<boolean> => {
  const vote = await ReviewHelpful.findOne({
    review: new Types.ObjectId(reviewId),
    user: new Types.ObjectId(userId),
  })
  return !!vote
}
