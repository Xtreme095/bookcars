import { Request, Response } from 'express'
import { Types } from 'mongoose'
import * as bookcarsTypes from ':bookcars-types'
import strings from '../config/app.config'
import Review from '../models/Review'
import ReviewHelpful from '../models/ReviewHelpful'
import Booking from '../models/Booking'
import Car from '../models/Car'
import User from '../models/User'
import * as reviewHelper from '../utils/reviewHelper'
import * as helper from '../utils/helper'
import { sendMail } from '../utils/mailHelper'
import i18n from '../lang/i18n'

/**
 * Submit a new review.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const submitReview = async (req: Request, res: Response) => {
  try {
    const { body }: { body: bookcarsTypes.SubmitReviewPayload } = req
    const userId = (req as any).userId

    const {
      bookingId,
      overallRating,
      vehicleConditionRating,
      valueForMoneyRating,
      customerServiceRating,
      pickupDropoffRating,
      title,
      comment,
      photos,
      language,
    } = body

    // Validate ratings
    const ratingsValidation = reviewHelper.validateRatings(
      overallRating,
      vehicleConditionRating,
      valueForMoneyRating,
      customerServiceRating,
      pickupDropoffRating,
    )
    if (!ratingsValidation.valid) {
      return res.status(400).json({ errors: ratingsValidation.errors })
    }

    // Validate content
    const contentValidation = reviewHelper.validateReviewContent(title, comment)
    if (!contentValidation.valid) {
      return res.status(400).json({ errors: contentValidation.errors })
    }

    // Check if user can review this booking
    const canReview = await reviewHelper.canReviewBooking(bookingId, userId)
    if (!canReview.canReview) {
      return res.status(403).json({ error: canReview.reason })
    }

    // Get booking details
    const booking = await Booking.findById(bookingId)
      .populate<{ car: bookcarsTypes.Car }>('car')
      .populate<{ supplier: bookcarsTypes.User }>('supplier')
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' })
    }

    // Create review
    const review = new Review({
      booking: new Types.ObjectId(bookingId),
      car: booking.car._id,
      supplier: booking.supplier._id,
      customer: new Types.ObjectId(userId),
      overallRating,
      vehicleConditionRating,
      valueForMoneyRating,
      customerServiceRating,
      pickupDropoffRating,
      title: title.trim(),
      comment: comment.trim(),
      photos: photos || [],
      verifiedBooking: true,
      status: 'pending', // Requires moderation
      language: language || 'en',
    })

    await review.save()

    // Send notification to supplier
    const customer = await User.findById(userId)
    if (customer && booking.supplier.email) {
      const supplier = booking.supplier
      i18n.locale = supplier.language || 'en'

      const mailOptions = {
        from: strings.SMTP_FROM,
        to: supplier.email,
        subject: i18n.t('NEW_REVIEW_SUBJECT'),
        html: i18n.t('NEW_REVIEW_BODY', {
          supplierName: supplier.fullName,
          customerName: customer.fullName,
          carName: booking.car.name,
          rating: overallRating,
          bookingId: booking._id?.toString(),
        }),
      }

      await sendMail(mailOptions)
    }

    return res.json({
      success: true,
      reviewId: review._id,
      status: review.status,
    })
  } catch (err) {
    console.error(`[review.submitReview] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Get reviews for a car.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const getCarReviews = async (req: Request, res: Response) => {
  try {
    const { carId } = req.params
    const page = Number.parseInt(req.query.page as string, 10) || 1
    const limit = Number.parseInt(req.query.limit as string, 10) || 10
    const rating = req.query.rating ? Number.parseInt(req.query.rating as string, 10) : undefined
    const sort = (req.query.sort as string) || 'recent'

    // Build query
    const query: any = {
      car: new Types.ObjectId(carId),
      status: 'approved',
    }

    if (rating) {
      query.overallRating = rating
    }

    // Build sort
    let sortQuery: any = { createdAt: -1 }
    if (sort === 'highest') {
      sortQuery = { overallRating: -1, createdAt: -1 }
    } else if (sort === 'lowest') {
      sortQuery = { overallRating: 1, createdAt: -1 }
    } else if (sort === 'helpful') {
      sortQuery = { helpfulCount: -1, createdAt: -1 }
    }

    const skip = (page - 1) * limit

    const reviews = await Review.find(query)
      .populate<{ customer: bookcarsTypes.User }>('customer', 'fullName avatar')
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean()

    const totalReviews = await Review.countDocuments(query)

    // Get average rating and distribution
    const car = await Car.findById(carId)
    const distribution = await reviewHelper.getRatingDistribution(carId)

    return res.json({
      reviews,
      averageRating: car?.averageRating || 0,
      totalReviews,
      ratingDistribution: distribution,
      page,
      pages: Math.ceil(totalReviews / limit),
    })
  } catch (err) {
    console.error(`[review.getCarReviews] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Get reviews for a supplier.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const getSupplierReviews = async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params
    const page = Number.parseInt(req.query.page as string, 10) || 1
    const limit = Number.parseInt(req.query.limit as string, 10) || 10
    const rating = req.query.rating ? Number.parseInt(req.query.rating as string, 10) : undefined
    const sort = (req.query.sort as string) || 'recent'

    const query: any = {
      supplier: new Types.ObjectId(supplierId),
      status: 'approved',
    }

    if (rating) {
      query.overallRating = rating
    }

    let sortQuery: any = { createdAt: -1 }
    if (sort === 'highest') {
      sortQuery = { overallRating: -1, createdAt: -1 }
    } else if (sort === 'lowest') {
      sortQuery = { overallRating: 1, createdAt: -1 }
    } else if (sort === 'helpful') {
      sortQuery = { helpfulCount: -1, createdAt: -1 }
    }

    const skip = (page - 1) * limit

    const reviews = await Review.find(query)
      .populate<{ customer: bookcarsTypes.User }>('customer', 'fullName avatar')
      .populate<{ car: bookcarsTypes.Car }>('car', 'name image')
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean()

    const totalReviews = await Review.countDocuments(query)

    const supplier = await User.findById(supplierId)

    return res.json({
      reviews,
      averageRating: supplier?.averageRating || 0,
      totalReviews,
      page,
      pages: Math.ceil(totalReviews / limit),
    })
  } catch (err) {
    console.error(`[review.getSupplierReviews] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Supplier responds to a review.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const respondToReview = async (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params
    const { responseText } = req.body
    const userId = (req as any).userId

    if (!responseText || responseText.trim().length === 0) {
      return res.status(400).json({ error: 'Response text is required' })
    }

    if (responseText.length > 1000) {
      return res.status(400).json({ error: 'Response text must be 1000 characters or less' })
    }

    const review = await Review.findById(reviewId)
    if (!review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    // Check if user is the supplier
    if (review.supplier.toString() !== userId) {
      return res.status(403).json({ error: 'Only the supplier can respond to this review' })
    }

    // Update review with response
    review.supplierResponse = {
      text: responseText.trim(),
      respondedAt: new Date(),
    }
    await review.save()

    // Update supplier response statistics
    await reviewHelper.updateSupplierRatings(userId)

    return res.json({ success: true })
  } catch (err) {
    console.error(`[review.respondToReview] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Mark review as helpful/not helpful.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const markHelpful = async (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params
    const { helpful } = req.body
    const userId = (req as any).userId

    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ error: 'Helpful must be a boolean' })
    }

    const review = await Review.findById(reviewId)
    if (!review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    // Check if user already voted
    const existingVote = await ReviewHelpful.findOne({
      review: new Types.ObjectId(reviewId),
      user: new Types.ObjectId(userId),
    })

    if (existingVote) {
      // Update existing vote
      existingVote.helpful = helpful
      await existingVote.save()
    } else {
      // Create new vote
      const vote = new ReviewHelpful({
        review: new Types.ObjectId(reviewId),
        user: new Types.ObjectId(userId),
        helpful,
      })
      await vote.save()
    }

    // Update helpful count
    const helpfulCount = await ReviewHelpful.countDocuments({
      review: new Types.ObjectId(reviewId),
      helpful: true,
    })

    review.helpfulCount = helpfulCount
    await review.save()

    return res.json({ success: true, helpfulCount })
  } catch (err) {
    console.error(`[review.markHelpful] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Report a review.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const reportReview = async (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params
    const { reason } = req.body

    const review = await Review.findById(reviewId)
    if (!review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    review.reportCount = (review.reportCount || 0) + 1
    await review.save()

    // TODO: Send notification to admin about reported review

    return res.json({ success: true })
  } catch (err) {
    console.error(`[review.reportReview] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Moderate a review (Admin only).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const moderateReview = async (req: Request, res: Response) => {
  try {
    const { reviewId } = req.params
    const { action, rejectionReason } = req.body
    const userId = (req as any).userId

    if (!['approve', 'reject', 'hide'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' })
    }

    const review = await Review.findById(reviewId)
    if (!review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    // Update review status
    if (action === 'approve') {
      review.status = 'approved'
    } else if (action === 'reject') {
      review.status = 'rejected'
      review.rejectionReason = rejectionReason
    } else if (action === 'hide') {
      review.status = 'hidden'
    }

    review.moderatedBy = new Types.ObjectId(userId)
    review.moderatedAt = new Date()
    await review.save()

    // Update car and supplier ratings if approved
    if (action === 'approve') {
      await reviewHelper.updateCarRatings(review.car.toString())
      await reviewHelper.updateSupplierRatings(review.supplier.toString())
    }

    return res.json({ success: true })
  } catch (err) {
    console.error(`[review.moderateReview] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Get pending reviews (Admin only).
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const getPendingReviews = async (req: Request, res: Response) => {
  try {
    const page = Number.parseInt(req.query.page as string, 10) || 1
    const limit = Number.parseInt(req.query.limit as string, 10) || 10
    const skip = (page - 1) * limit

    const reviews = await Review.find({ status: 'pending' })
      .populate<{ customer: bookcarsTypes.User }>('customer', 'fullName avatar email')
      .populate<{ car: bookcarsTypes.Car }>('car', 'name image')
      .populate<{ supplier: bookcarsTypes.User }>('supplier', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const totalReviews = await Review.countDocuments({ status: 'pending' })

    return res.json({
      reviews,
      page,
      pages: Math.ceil(totalReviews / limit),
      total: totalReviews,
    })
  } catch (err) {
    console.error(`[review.getPendingReviews] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}

/**
 * Check if user can review a booking.
 *
 * @export
 * @async
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
export const checkCanReview = async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params
    const userId = (req as any).userId

    const result = await reviewHelper.canReviewBooking(bookingId, userId)
    return res.json(result)
  } catch (err) {
    console.error(`[review.checkCanReview] ${strings.DB_ERROR} ${(err as Error).message}`, err)
    return res.status(400).json({ error: strings.DB_ERROR })
  }
}
