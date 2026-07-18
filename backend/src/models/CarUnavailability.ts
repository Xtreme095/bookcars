import { Schema, model } from 'mongoose'
import * as env from '../config/env.config'

const carUnavailabilitySchema = new Schema<env.CarUnavailability>(
  {
    car: {
      type: Schema.Types.ObjectId,
      required: [true, "can't be blank"],
      ref: 'Car',
      index: true,
    },
    from: {
      type: Date,
      required: [true, "can't be blank"],
    },
    to: {
      type: Date,
      required: [true, "can't be blank"],
    },
    reason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'CarUnavailability',
  },
)

carUnavailabilitySchema.index({ car: 1, from: 1, to: 1 })

const CarUnavailability = model<env.CarUnavailability>('CarUnavailability', carUnavailabilitySchema)

export default CarUnavailability
