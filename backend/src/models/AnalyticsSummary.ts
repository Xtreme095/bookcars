import { Schema, model, Model } from 'mongoose'

interface ISupplierBreakdown {
  supplier: Schema.Types.ObjectId
  revenue: number
  bookings: number
  commission: number
}

interface ILocationBreakdown {
  location: Schema.Types.ObjectId
  bookings: number
  revenue: number
}

interface IVehicleTypeBreakdown {
  type: string
  bookings: number
  revenue: number
}

interface IAnalyticsSummary {
  date: Date
  type: 'daily' | 'weekly' | 'monthly'
  totalRevenue: number
  platformCommission: number
  supplierEarnings: number
  totalBookings: number
  confirmedBookings: number
  paidBookings: number
  cancelledBookings: number
  totalCustomers: number
  newCustomers: number
  repeatCustomers: number
  totalVehicles: number
  availableVehicles: number
  bookedVehicles: number
  bySupplier: ISupplierBreakdown[]
  byLocation: ILocationBreakdown[]
  byVehicleType: IVehicleTypeBreakdown[]
  createdAt?: Date
  updatedAt?: Date
}

const analyticsSummarySchema = new Schema<IAnalyticsSummary>(
  {
    date: {
      type: Date,
      required: [true, "Can't leave blank"],
      index: true,
    },
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: [true, "Can't leave blank"],
      index: true,
    },
    totalRevenue: {
      type: Number,
      default: 0,
    },
    platformCommission: {
      type: Number,
      default: 0,
    },
    supplierEarnings: {
      type: Number,
      default: 0,
    },
    totalBookings: {
      type: Number,
      default: 0,
    },
    confirmedBookings: {
      type: Number,
      default: 0,
    },
    paidBookings: {
      type: Number,
      default: 0,
    },
    cancelledBookings: {
      type: Number,
      default: 0,
    },
    totalCustomers: {
      type: Number,
      default: 0,
    },
    newCustomers: {
      type: Number,
      default: 0,
    },
    repeatCustomers: {
      type: Number,
      default: 0,
    },
    totalVehicles: {
      type: Number,
      default: 0,
    },
    availableVehicles: {
      type: Number,
      default: 0,
    },
    bookedVehicles: {
      type: Number,
      default: 0,
    },
    bySupplier: [
      {
        supplier: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        revenue: {
          type: Number,
          default: 0,
        },
        bookings: {
          type: Number,
          default: 0,
        },
        commission: {
          type: Number,
          default: 0,
        },
      },
    ],
    byLocation: [
      {
        location: {
          type: Schema.Types.ObjectId,
          ref: 'Location',
        },
        bookings: {
          type: Number,
          default: 0,
        },
        revenue: {
          type: Number,
          default: 0,
        },
      },
    ],
    byVehicleType: [
      {
        type: {
          type: String,
        },
        bookings: {
          type: Number,
          default: 0,
        },
        revenue: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  {
    timestamps: true,
    strict: true,
    collection: 'AnalyticsSummary',
  },
)

analyticsSummarySchema.index({ date: 1, type: 1 }, { unique: true })

const AnalyticsSummary: Model<IAnalyticsSummary> = model<IAnalyticsSummary>('AnalyticsSummary', analyticsSummarySchema)

export default AnalyticsSummary
