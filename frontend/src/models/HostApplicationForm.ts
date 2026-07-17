import { z } from 'zod'
import validator from 'validator'
import { strings } from '@/lang/host'

/**
 * Validate a Croatian OIB (11 digits, ISO 7064 MOD 11,10 checksum).
 *
 * @param {string} oib
 * @returns {boolean}
 */
export const validateOib = (oib: string): boolean => {
  if (!/^\d{11}$/.test(oib)) {
    return false
  }
  let a = 10
  for (let i = 0; i < 10; i += 1) {
    a = (a + Number.parseInt(oib[i], 10)) % 10
    if (a === 0) {
      a = 10
    }
    a = (a * 2) % 11
  }
  const control = (11 - a) % 10
  return control === Number.parseInt(oib[10], 10)
}

export const personalSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  oib: z.string().refine((value) => validateOib(value), { message: strings.OIB_NOT_VALID }),
})

export const payoutSchema = z.object({
  iban: z.string().refine((value) => validator.isIBAN(value.replace(/\s/g, '').toUpperCase()), { message: strings.IBAN_NOT_VALID }),
  swiftBic: z.string().optional(),
  bankAccountHolder: z.string().min(1),
})

export const schema = personalSchema.merge(payoutSchema)

export type PersonalFields = z.infer<typeof personalSchema>
export type PayoutFields = z.infer<typeof payoutSchema>
export type FormFields = z.infer<typeof schema>
