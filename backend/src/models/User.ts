import validator from 'validator'
import { Schema, model } from 'mongoose'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../config/env.config'

export const USER_EXPIRE_AT_INDEX_NAME = 'expireAt'

const userSchema = new Schema<env.User>(
  {
    supplier: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    email: {
      type: String,
      lowercase: true,
      unique: true,
      required: [true, "can't be blank"],
      validate: [validator.isEmail, 'is not valid'],
      index: true,
      trim: true,
    },
    phone: {
      type: String,
      validate: {
        validator: (value: string) => {
          // Check if value is empty then return true.
          if (!value) {
            return true
          }

          // If value is empty will not validate for mobile phone.
          return validator.isMobilePhone(value)
        },
        message: '{VALUE} is not valid',
      },
      trim: true,
    },
    fullName: {
      type: String,
      required: [true, "can't be blank"],
      index: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
    },
    birthDate: {
      type: Date,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
    },
    active: {
      type: Boolean,
      default: false,
    },
    language: {
      // ISO 639-1 (alpha-2 code)
      type: String,
      default: env.DEFAULT_LANGUAGE,
      lowercase: true,
      minlength: 2,
      maxlength: 2,
    },
    enableEmailNotifications: {
      type: Boolean,
      default: true,
    },
    avatar: {
      type: String,
    },
    bio: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        bookcarsTypes.UserType.Admin,
        bookcarsTypes.UserType.Supplier,
        bookcarsTypes.UserType.User,
      ],
      default: bookcarsTypes.UserType.User,
    },
    blacklisted: {
      type: Boolean,
      default: false,
    },
    payLater: {
      type: Boolean,
      default: true,
    },
    customerId: {
      type: String,
    },
    contracts: [{
      language: {
        type: String,
        required: [true, "can't be blank"],
        trim: true,
        lowercase: true,
        minLength: 2,
        maxLength: 2,
      },
      file: String,
    }],
    licenseRequired: {
      type: Boolean,
      default: false,
    },
    license: {
      type: String,
    },
    minimumRentalDays: {
      type: Number,
    },
    priceChangeRate: {
      type: Number,
    },
    supplierCarLimit: {
      type: Number,
    },
    notifyAdminOnNewCar: {
      type: Boolean,
    },
    expireAt: {
      //
      // Non verified and active users created from checkout with Stripe are temporary and
      // are automatically deleted if the payment checkout session expires.
      //
      type: Date,
      index: { name: USER_EXPIRE_AT_INDEX_NAME, expireAfterSeconds: env.USER_EXPIRE_AT, background: true },
    },

    // Commission settings (for suppliers)
    commissionType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'percentage',
    },
    commissionPercentage: {
      type: Number,
      default: 15, // Default 15% commission for basic tier
      min: 0,
      max: 100,
    },
    commissionFlat: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Payout settings (for suppliers)
    bankAccountHolder: {
      type: String,
      trim: true,
    },
    bankName: {
      type: String,
      trim: true,
    },
    iban: {
      type: String,
      trim: true,
      uppercase: true,
    },
    swiftBic: {
      type: String,
      trim: true,
      uppercase: true,
    },

    // Tiering (for suppliers)
    tier: {
      type: String,
      enum: ['basic', 'silver', 'gold'],
      default: 'basic',
    },
    tierCommissionRate: {
      type: Number,
      min: 0,
      max: 100,
    },

    // Financial tracking (for suppliers)
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentMonthBookings: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastPayoutDate: {
      type: Date,
    },
    pendingPayout: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Croatian business info (for suppliers)
    companyName: {
      type: String,
      trim: true,
    },
    oib: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => {
          // OIB must be empty or exactly 11 digits
          if (!value) {
            return true
          }
          return /^\d{11}$/.test(value)
        },
        message: 'OIB must be exactly 11 digits',
      },
    },
    companyAddress: {
      type: String,
      trim: true,
    },
    companyCity: {
      type: String,
      trim: true,
    },
    companyZip: {
      type: String,
      trim: true,
    },

    // Verification (for suppliers)
    businessVerified: {
      type: Boolean,
      default: false,
    },
    verificationDocuments: [{
      type: String,
    }],
  },
  {
    timestamps: true,
    strict: true,
    collection: 'User',
  },
)

// Add custom indexes
userSchema.index({ type: 1, expireAt: 1, fullName: 1 })
userSchema.index({ type: 1, expireAt: 1, email: 1 })
userSchema.index({ type: 1, expireAt: 1, fullName: 1, _id: 1 })
userSchema.index({ type: 1, expireAt: 1, email: 1, _id: 1 })

const User = model<env.User>('User', userSchema)

export default User
