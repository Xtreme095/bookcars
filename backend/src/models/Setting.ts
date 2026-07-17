import { Schema, model } from 'mongoose'
import * as env from '../config/env.config'

const settingSchema = new Schema<env.Setting>({
  minPickupHours: {
    type: Number,
    default: 1,
    min: 1,
  },
  minRentalHours: {
    type: Number,
    default: 1,
    min: 1,
  },
  minPickupDropoffHour: {
    type: Number,
    default: 0,
    min: 0,
    max: 23,
  },
  maxPickupDropoffHour: {
    type: Number,
    default: 23,
    min: 0,
    max: 23,
  },
  platformCommissionPct: {
    // Default platform commission (%) applied to host bookings when the
    // host has no per-host override (host.commissionPct)
    type: Number,
    default: 35,
    min: 0,
    max: 100,
  },
}, {
  timestamps: true,
  strict: true,
  collection: 'Setting',
})

const Setting = model<env.Setting>('Setting', settingSchema)

export default Setting
