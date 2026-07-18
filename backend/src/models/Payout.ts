import { Schema, model } from 'mongoose'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../config/env.config'

const payoutSchema = new Schema<env.Payout>(
  {
    host: {
      type: Schema.Types.ObjectId,
      required: [true, "can't be blank"],
      ref: 'User',
      index: true,
    },
    year: {
      type: Number,
      required: [true, "can't be blank"],
    },
    month: {
      // 1-12
      type: Number,
      required: [true, "can't be blank"],
      min: 1,
      max: 12,
    },
    entries: {
      type: [Schema.Types.ObjectId],
      ref: 'CommissionTransaction',
      default: [],
    },
    bookingsCount: {
      type: Number,
      required: [true, "can't be blank"],
      default: 0,
    },
    grossTotal: {
      type: Number,
      required: [true, "can't be blank"],
      default: 0,
    },
    commissionTotal: {
      type: Number,
      required: [true, "can't be blank"],
      default: 0,
    },
    shareTotal: {
      type: Number,
      required: [true, "can't be blank"],
      default: 0,
    },
    guaranteedMinimum: {
      // snapshot of host.guaranteedMonthlyMinimum at generation time
      type: Number,
      required: [true, "can't be blank"],
      default: 0,
    },
    amount: {
      // max(shareTotal, guaranteedMinimum)
      type: Number,
      required: [true, "can't be blank"],
      default: 0,
    },
    currency: {
      type: String,
      default: 'EUR',
      uppercase: true,
    },
    status: {
      type: String,
      enum: [
        bookcarsTypes.PayoutStatus.Pending,
        bookcarsTypes.PayoutStatus.Paid,
      ],
      default: bookcarsTypes.PayoutStatus.Pending,
      index: true,
    },
    paidAt: {
      type: Date,
    },
    reference: {
      type: String,
      trim: true,
    },
    statementFile: {
      type: String,
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'Payout',
  },
)

payoutSchema.index({ host: 1, year: 1, month: 1 }, { unique: true })
payoutSchema.index({ year: 1, month: 1, status: 1 })

const Payout = model<env.Payout>('Payout', payoutSchema)

export default Payout
