import { z } from 'zod'
import { strings } from '@/lang/host-cars'

const currentYear = new Date().getFullYear()
const intRegex = /^\d+$/
const priceRegex = /^\d+([.,]\d+)?$/

const toNumber = (value: string) => Number.parseFloat(value.replace(',', '.'))

export const schema = z.object({
  make: z.string().min(1),
  carModel: z.string().min(1),
  year: z.string().refine((v) => intRegex.test(v) && Number.parseInt(v, 10) >= 1950 && Number.parseInt(v, 10) <= currentYear + 1),
  licensePlate: z.string().min(1),
  dailyPrice: z.string().refine((v) => priceRegex.test(v) && toNumber(v) > 0),
  deposit: z.string().refine((v) => priceRegex.test(v) && toNumber(v) >= 0),
  minRentalDays: z.string().refine((v) => !v || (intRegex.test(v) && Number.parseInt(v, 10) >= 1)),
  maxRentalDays: z.string().refine((v) => !v || (intRegex.test(v) && Number.parseInt(v, 10) >= 1)),
  type: z.string().min(1),
  gearbox: z.string().min(1),
  range: z.string().min(1),
  aircon: z.boolean(),
  seats: z.string().refine((v) => intRegex.test(v) && Number.parseInt(v, 10) >= 1 && Number.parseInt(v, 10) <= 9),
  doors: z.string().refine((v) => intRegex.test(v) && Number.parseInt(v, 10) >= 2 && Number.parseInt(v, 10) <= 6),
  fuelPolicy: z.string().min(1),
  unlimitedMileage: z.boolean(),
  mileage: z.string(),
}).refine((data) => {
  if (data.minRentalDays && data.maxRentalDays) {
    return Number.parseInt(data.minRentalDays, 10) <= Number.parseInt(data.maxRentalDays, 10)
  }
  return true
}, {
  path: ['maxRentalDays'],
  message: strings.INVALID_PERIOD,
}).refine((data) => data.unlimitedMileage || (intRegex.test(data.mileage) && Number.parseInt(data.mileage, 10) > 0), {
  path: ['mileage'],
  message: strings.LIMITED_KM,
})

export type FormFields = z.infer<typeof schema>

export const toPayloadNumbers = (data: FormFields) => ({
  year: Number.parseInt(data.year, 10),
  dailyPrice: toNumber(data.dailyPrice),
  deposit: toNumber(data.deposit),
  minRentalDays: data.minRentalDays ? Number.parseInt(data.minRentalDays, 10) : undefined,
  maxRentalDays: data.maxRentalDays ? Number.parseInt(data.maxRentalDays, 10) : undefined,
  seats: Number.parseInt(data.seats, 10),
  doors: Number.parseInt(data.doors, 10),
  mileage: data.unlimitedMileage ? -1 : Number.parseInt(data.mileage, 10),
})
