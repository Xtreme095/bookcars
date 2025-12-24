import { Schema, model } from 'mongoose'
import * as env from '../config/env.config'

const commissionTransactionSchema = new Schema<env.CommissionTransaction>(
  {
    booking: {
      type: Schema.Types.ObjectId,
      required: [true, "can't be blank"],
      ref: 'Booking',
      unique: true, // One commission transaction per booking
      index: true,
    },
    supplier: {
      type: Schema.Types.ObjectId,
      required: [true, "can't be blank"],
      ref: 'User',
      index: true,
    },

    // Financial breakdown
    totalBookingAmount: {
      type: Number,
      required: [true, "can't be blank"],
      min: 0,
    },
    supplierEarnings: {
      type: Number,
      required: [true, "can't be blank"],
      min: 0,
    },
    platformCommission: {
      type: Number,
      required: [true, "can't be blank"],
      min: 0,
    },
    commissionType: {
      type: String,
      enum: ['flat', 'percentage'],
      required: [true, "can't be blank"],
      default: 'percentage',
    },
    commissionValue: {
      type: Number,
      required: [true, "can't be blank"],
      min: 0,
    },
    paymentGatewayFee: {
      type: Number,
      required: [true, "can't be blank"],
      min: 0,
      default: 0,
    },
    netRevenue: {
      type: Number,
      required: [true, "can't be blank"],
    },

    // Tax (Croatian PDV - VAT)
    pdvRate: {
      type: Number,
      required: [true, "can't be blank"],
      default: 25, // Croatian VAT rate: 25%
    },
    pdvAmount: {
      type: Number,
      required: [true, "can't be blank"],
      min: 0,
    },

    // Payout tracking
    payoutStatus: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'failed'],
      required: [true, "can't be blank"],
      default: 'pending',
      index: true,
    },
    payoutDate: {
      type: Date,
      index: true,
    },
    payoutMethod: {
      type: String,
      enum: ['bank_transfer', 'hold', 'manual'],
      default: 'bank_transfer',
    },
    payoutReference: {
      type: String,
      trim: true,
    },

    // Documentation
    invoice: {
      type: String,
      trim: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'CommissionTransaction',
  },
)

// Compound indexes for common queries
commissionTransactionSchema.index({ supplier: 1, payoutStatus: 1, createdAt: -1 })
commissionTransactionSchema.index({ supplier: 1, payoutDate: 1 })
commissionTransactionSchema.index({ createdAt: -1 })

const CommissionTransaction = model<env.CommissionTransaction>('CommissionTransaction', commissionTransactionSchema)

export default CommissionTransaction
