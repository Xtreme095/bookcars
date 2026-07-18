import path from 'node:path'
import fs from 'node:fs'
import asyncFs from 'node:fs/promises'
import PDFDocument from 'pdfkit'
import { nanoid } from 'nanoid'
import * as bookcarsTypes from ':bookcars-types'
import * as env from '../config/env.config'
import Booking from '../models/Booking'
import * as helper from './helper'
import * as logger from './logger'
import * as pdfFonts from './pdfFonts'

/**
 * Rental agreement PDF (P2P), in Croatian or English.
 *
 * The platform (operating company) is the lessor — hosts lease their
 * vehicles to the platform, so they are not a party to the rental
 * agreement with the renter.
 */

interface AgreementLabels {
  title: string
  number: string
  parties: string
  lessor: string
  renter: string
  oib: string
  iban: string
  email: string
  phone: string
  birthDate: string
  additionalDriver: string
  vehicle: string
  vehicleName: string
  licensePlate: string
  fuel: string
  gearbox: string
  seats: string
  period: string
  from: string
  to: string
  pickupLocation: string
  dropOffLocation: string
  price: string
  total: string
  deposit: string
  options: string
  optionCancellation: string
  optionAmendments: string
  optionTheftProtection: string
  optionCollisionDamageWaiver: string
  optionFullInsurance: string
  optionAdditionalDriver: string
  paymentStatus: string
  paymentPaid: string
  paymentDeposit: string
  paymentOnSite: string
  terms: string
  termsItems: string[]
  signatures: string
  lessorSignature: string
  renterSignature: string
  placeAndDate: string
  generated: string
}

const LABELS: Record<'en' | 'hr', AgreementLabels> = {
  en: {
    title: 'VEHICLE RENTAL AGREEMENT',
    number: 'Agreement no.',
    parties: '1. Contracting parties',
    lessor: 'Lessor',
    renter: 'Renter',
    oib: 'OIB',
    iban: 'IBAN',
    email: 'Email',
    phone: 'Phone',
    birthDate: 'Date of birth',
    additionalDriver: 'Additional driver',
    vehicle: '2. Vehicle',
    vehicleName: 'Vehicle',
    licensePlate: 'License plate',
    fuel: 'Fuel',
    gearbox: 'Gearbox',
    seats: 'Seats',
    period: '3. Rental period',
    from: 'Pick-up',
    to: 'Drop-off',
    pickupLocation: 'Pick-up location',
    dropOffLocation: 'Drop-off location',
    price: '4. Price and deposit',
    total: 'Total price',
    deposit: 'Deposit',
    options: 'Included options',
    optionCancellation: 'Cancellation',
    optionAmendments: 'Amendments',
    optionTheftProtection: 'Theft protection',
    optionCollisionDamageWaiver: 'Collision damage waiver',
    optionFullInsurance: 'Full insurance',
    optionAdditionalDriver: 'Additional driver',
    paymentStatus: 'Payment',
    paymentPaid: 'Paid in full',
    paymentDeposit: 'Deposit paid — balance due at pick-up',
    paymentOnSite: 'Payable at pick-up',
    terms: '5. Terms and conditions',
    termsItems: [
      'The renter must present a valid driver\'s license and identity document at pick-up.',
      'The renter must return the vehicle at the agreed time and place, in the same condition as received.',
      'The security deposit is authorised or collected at pick-up and released after the vehicle is returned undamaged.',
      'The renter is liable for traffic violations, fines and tolls incurred during the rental period.',
      'The vehicle must not be used for racing, towing, sub-rental, or driven outside Croatia without the lessor\'s prior written consent.',
      'Fuel policy and mileage limits stated in the booking apply; excess use is charged according to the price list.',
      'In case of an accident or breakdown, the renter must notify the lessor immediately and, where applicable, the police.',
      'All disputes will be settled amicably; otherwise the court with jurisdiction over the lessor\'s registered office applies. Croatian law governs this agreement.',
    ],
    signatures: '6. Signatures',
    lessorSignature: 'For the lessor',
    renterSignature: 'Renter',
    placeAndDate: 'Place and date',
    generated: 'Generated electronically by',
  },
  hr: {
    title: 'UGOVOR O NAJMU VOZILA',
    number: 'Ugovor br.',
    parties: '1. Ugovorne strane',
    lessor: 'Najmodavac',
    renter: 'Najmoprimac',
    oib: 'OIB',
    iban: 'IBAN',
    email: 'E-mail',
    phone: 'Telefon',
    birthDate: 'Datum rođenja',
    additionalDriver: 'Dodatni vozač',
    vehicle: '2. Vozilo',
    vehicleName: 'Vozilo',
    licensePlate: 'Registarska oznaka',
    fuel: 'Gorivo',
    gearbox: 'Mjenjač',
    seats: 'Sjedala',
    period: '3. Razdoblje najma',
    from: 'Preuzimanje',
    to: 'Vraćanje',
    pickupLocation: 'Mjesto preuzimanja',
    dropOffLocation: 'Mjesto vraćanja',
    price: '4. Cijena i polog',
    total: 'Ukupna cijena',
    deposit: 'Polog',
    options: 'Uključene opcije',
    optionCancellation: 'Otkazivanje',
    optionAmendments: 'Izmjene',
    optionTheftProtection: 'Zaštita od krađe',
    optionCollisionDamageWaiver: 'Osiguranje od sudara (CDW)',
    optionFullInsurance: 'Puno osiguranje',
    optionAdditionalDriver: 'Dodatni vozač',
    paymentStatus: 'Plaćanje',
    paymentPaid: 'Plaćeno u cijelosti',
    paymentDeposit: 'Polog plaćen — ostatak pri preuzimanju',
    paymentOnSite: 'Plaćanje pri preuzimanju',
    terms: '5. Uvjeti najma',
    termsItems: [
      'Najmoprimac je dužan pri preuzimanju predočiti važeću vozačku dozvolu i osobni dokument.',
      'Najmoprimac je dužan vratiti vozilo u ugovoreno vrijeme i na ugovoreno mjesto, u stanju u kakvom ga je preuzeo.',
      'Polog se autorizira ili naplaćuje pri preuzimanju i vraća nakon povrata neoštećenog vozila.',
      'Najmoprimac odgovara za prometne prekršaje, kazne i cestarine nastale tijekom razdoblja najma.',
      'Vozilo se ne smije koristiti za utrke, vuču, podnajam niti voziti izvan Hrvatske bez prethodne pisane suglasnosti najmodavca.',
      'Primjenjuju se politika goriva i ograničenja kilometraže navedeni u rezervaciji; prekoračenja se naplaćuju prema cjeniku.',
      'U slučaju nezgode ili kvara najmoprimac je dužan odmah obavijestiti najmodavca te, prema potrebi, policiju.',
      'Sporovi se rješavaju mirnim putem; u suprotnom je nadležan sud prema sjedištu najmodavca. Na ovaj ugovor primjenjuje se hrvatsko pravo.',
    ],
    signatures: '6. Potpisi',
    lessorSignature: 'Za najmodavca',
    renterSignature: 'Najmoprimac',
    placeAndDate: 'Mjesto i datum',
    generated: 'Elektronički izradio sustav',
  },
}

const eur = (value: number) => `${value.toFixed(2)} €`

const dateTimeStr = (date: Date, language: 'en' | 'hr') => new Intl.DateTimeFormat(language === 'hr' ? 'hr-HR' : 'en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: env.TIMEZONE,
}).format(new Date(date))

export interface AgreementData {
  language: 'en' | 'hr'
  reference: string
  renterName: string
  renterEmail?: string
  renterPhone?: string
  renterBirthDate?: Date
  additionalDriverName?: string
  vehicleName: string
  licensePlate?: string
  fuel?: string
  gearbox?: string
  seats?: number
  from: Date
  to: Date
  pickupLocation: string
  dropOffLocation: string
  price: number
  deposit: number
  options: { label: keyof AgreementLabels, price: number }[]
  paymentStatus: 'paid' | 'deposit' | 'onSite'
}

/**
 * Generate a rental agreement PDF.
 *
 * @export
 * @async
 * @param {AgreementData} data
 * @param {string} filepath
 * @returns {Promise<void>}
 */
export const generateAgreementPDF = async (data: AgreementData, filepath: string): Promise<void> => {
  const labels = LABELS[data.language]
  const { regular, bold } = await pdfFonts.getFonts()

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const stream = fs.createWriteStream(filepath)
  doc.pipe(stream)

  const textColor = '#1f2937'
  const grayColor = '#6b7280'
  const lineColor = '#d1d5db'

  // header
  doc.font(bold).fontSize(16).fillColor(textColor).text(labels.title, 50, 50, { width: 495, align: 'center' })
  doc.font(regular).fontSize(10).fillColor(grayColor).text(`${labels.number} ${data.reference}`, 50, 74, { width: 495, align: 'center' })

  let y = 105

  const section = (title: string) => {
    doc.font(bold).fontSize(11).fillColor(textColor).text(title, 50, y)
    y += 16
  }

  const field = (label: string, value: string) => {
    doc.font(regular).fontSize(9)
    const height = Math.max(
      doc.heightOfString(label, { width: 130 }),
      doc.heightOfString(value, { width: 365 }),
    )
    doc.fillColor(grayColor).text(label, 50, y, { width: 130 })
    doc.fillColor(textColor).text(value, 180, y, { width: 365 })
    y += height + 4
  }

  const line = (text: string) => {
    doc.font(regular).fontSize(9).fillColor(textColor)
    const height = doc.heightOfString(text, { width: 495 })
    doc.text(text, 50, y, { width: 495 })
    y += height + 3
  }

  // 1. parties
  section(labels.parties)
  doc.font(bold).fontSize(9).fillColor(textColor).text(`${labels.lessor}:`, 50, y)
  y += 13
  line(env.PLATFORM_NAME)
  if (env.PLATFORM_ADDRESS) {
    line(`${env.PLATFORM_ADDRESS}, ${env.PLATFORM_ZIP} ${env.PLATFORM_CITY}`)
  }
  if (env.PLATFORM_OIB) {
    line(`${labels.oib}: ${env.PLATFORM_OIB}`)
  }
  if (env.PLATFORM_EMAIL) {
    line(`${labels.email}: ${env.PLATFORM_EMAIL}`)
  }
  y += 4
  doc.font(bold).fontSize(9).fillColor(textColor).text(`${labels.renter}:`, 50, y)
  y += 13
  line(data.renterName)
  if (data.renterEmail) {
    line(`${labels.email}: ${data.renterEmail}`)
  }
  if (data.renterPhone) {
    line(`${labels.phone}: ${data.renterPhone}`)
  }
  if (data.renterBirthDate) {
    const birth = new Intl.DateTimeFormat(data.language === 'hr' ? 'hr-HR' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(data.renterBirthDate))
    line(`${labels.birthDate}: ${birth}`)
  }
  if (data.additionalDriverName) {
    line(`${labels.additionalDriver}: ${data.additionalDriverName}`)
  }

  // 2. vehicle
  y += 8
  section(labels.vehicle)
  field(labels.vehicleName, data.vehicleName)
  if (data.licensePlate) {
    field(labels.licensePlate, data.licensePlate)
  }
  if (data.fuel) {
    field(labels.fuel, data.fuel)
  }
  if (data.gearbox) {
    field(labels.gearbox, data.gearbox)
  }
  if (data.seats) {
    field(labels.seats, String(data.seats))
  }

  // 3. period
  y += 8
  section(labels.period)
  field(labels.from, `${dateTimeStr(data.from, data.language)} (${env.TIMEZONE})`)
  field(labels.to, `${dateTimeStr(data.to, data.language)} (${env.TIMEZONE})`)
  field(labels.pickupLocation, data.pickupLocation)
  field(labels.dropOffLocation, data.dropOffLocation)

  // 4. price
  y += 8
  section(labels.price)
  field(labels.total, eur(data.price))
  field(labels.deposit, eur(data.deposit))
  const paymentLabel = data.paymentStatus === 'paid'
    ? labels.paymentPaid
    : data.paymentStatus === 'deposit' ? labels.paymentDeposit : labels.paymentOnSite
  field(labels.paymentStatus, paymentLabel)
  if (data.options.length > 0) {
    field(labels.options, data.options.map((o) => `${labels[o.label]}${o.price > 0 ? ` (${eur(o.price)})` : ''}`).join(', '))
  }

  // 5. terms
  y += 8
  section(labels.terms)
  doc.font(regular).fontSize(8.5).fillColor(textColor)
  for (let i = 0; i < labels.termsItems.length; i += 1) {
    const item = `${i + 1}. ${labels.termsItems[i]}`
    const height = doc.heightOfString(item, { width: 495 })
    if (y + height > 770) {
      doc.addPage()
      y = 50
    }
    doc.text(item, 50, y, { width: 495 })
    y += height + 4
  }

  // 6. signatures
  y += 14
  if (y > 700) {
    doc.addPage()
    y = 50
  }
  section(labels.signatures)
  y += 30
  doc.moveTo(50, y).lineTo(230, y).strokeColor(lineColor).stroke()
  doc.moveTo(365, y).lineTo(545, y).strokeColor(lineColor).stroke()
  y += 5
  doc.font(regular).fontSize(8).fillColor(grayColor)
  doc.text(`${labels.lessorSignature} (${env.PLATFORM_NAME})`, 50, y, { width: 180 })
  doc.text(labels.renterSignature, 365, y, { width: 180 })
  y += 25
  doc.text(`${labels.placeAndDate}: ${env.PLATFORM_CITY ? `${env.PLATFORM_CITY}, ` : ''}${new Intl.DateTimeFormat(data.language === 'hr' ? 'hr-HR' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())}`, 50, y)
  y += 12
  doc.text(`${labels.generated} ${env.WEBSITE_NAME}.`, 50, y)

  doc.end()

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve())
    stream.on('error', (err) => reject(err))
  })
}

/**
 * Ensure a rental agreement PDF exists for a booking (idempotent unless
 * `force`). Called when a booking is confirmed on any payment path. Errors
 * are logged, never thrown — a booking must not fail because of agreement
 * generation.
 *
 * @export
 * @async
 * @param {string} bookingId
 * @param {boolean} [force=false]
 * @returns {Promise<env.BookingAgreement | null>}
 */
export const ensureAgreement = async (bookingId: string, force = false) => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate<{ driver: env.User }>('driver')
      .populate<{ car: env.Car }>('car')
      .populate<{ pickupLocation: env.LocationInfo }>({ path: 'pickupLocation', populate: { path: 'values', model: 'LocationValue' } })
      .populate<{ dropOffLocation: env.LocationInfo }>({ path: 'dropOffLocation', populate: { path: 'values', model: 'LocationValue' } })
      .populate<{ _additionalDriver: env.AdditionalDriver }>('_additionalDriver')

    if (!booking) {
      logger.error(`[agreementHelper.ensureAgreement] Booking ${bookingId} not found`)
      return null
    }

    if (booking.agreement && !force) {
      return booking.agreement
    }

    const { driver, car } = booking
    if (!driver || !car) {
      logger.error(`[agreementHelper.ensureAgreement] Driver or car of booking ${bookingId} not found`)
      return null
    }

    const language: 'en' | 'hr' = driver.language === 'hr' ? 'hr' : 'en'

    const locationName = (location: env.LocationInfo): string => {
      const values = (location.values || []) as env.LocationValue[]
      return values.find((v) => v.language === language)?.value
        || values.find((v) => v.language === 'en')?.value
        || ''
    }

    const options: AgreementData['options'] = []
    if (booking.cancellation && car.cancellation > 0) {
      options.push({ label: 'optionCancellation', price: car.cancellation })
    }
    if (booking.amendments && car.amendments > 0) {
      options.push({ label: 'optionAmendments', price: car.amendments })
    }
    if (booking.theftProtection && car.theftProtection > 0) {
      options.push({ label: 'optionTheftProtection', price: car.theftProtection })
    }
    if (booking.collisionDamageWaiver && car.collisionDamageWaiver > 0) {
      options.push({ label: 'optionCollisionDamageWaiver', price: car.collisionDamageWaiver })
    }
    if (booking.fullInsurance && car.fullInsurance > 0) {
      options.push({ label: 'optionFullInsurance', price: car.fullInsurance })
    }
    if (booking.additionalDriver && car.additionalDriver > 0) {
      options.push({ label: 'optionAdditionalDriver', price: car.additionalDriver })
    }

    let paymentStatus: AgreementData['paymentStatus'] = 'onSite'
    if ([bookcarsTypes.BookingStatus.Paid, bookcarsTypes.BookingStatus.PaidInFull].includes(booking.status)) {
      paymentStatus = 'paid'
    } else if (booking.status === bookcarsTypes.BookingStatus.Deposit) {
      paymentStatus = 'deposit'
    }

    const data: AgreementData = {
      language,
      reference: `${booking._id.toString().substring(18).toUpperCase()}-${new Date().getFullYear()}`,
      renterName: driver.fullName,
      renterEmail: driver.email,
      renterPhone: driver.phone,
      renterBirthDate: driver.birthDate,
      additionalDriverName: booking._additionalDriver?.fullName,
      vehicleName: car.name,
      licensePlate: car.licensePlate,
      fuel: car.type,
      gearbox: car.gearbox,
      seats: car.seats,
      from: booking.from,
      to: booking.to,
      pickupLocation: locationName(booking.pickupLocation),
      dropOffLocation: locationName(booking.dropOffLocation),
      price: booking.price,
      deposit: car.deposit,
      options,
      paymentStatus,
    }

    await helper.mkdir(env.CDN_AGREEMENTS)

    if (booking.agreement?.file) {
      const oldFile = path.join(env.CDN_AGREEMENTS, path.basename(booking.agreement.file))
      if (await helper.pathExists(oldFile)) {
        await asyncFs.unlink(oldFile)
      }
    }

    const file = `${booking._id.toString()}_${nanoid()}.pdf`
    await generateAgreementPDF(data, path.join(env.CDN_AGREEMENTS, file))

    booking.agreement = { file, language, generatedAt: new Date() }
    await booking.save()

    return booking.agreement
  } catch (err) {
    logger.error(`[agreementHelper.ensureAgreement] Error for booking ${bookingId}:`, err)
    return null
  }
}
