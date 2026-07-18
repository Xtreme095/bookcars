import path from 'node:path'
import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import * as env from '../config/env.config'
import * as helper from './helper'

/**
 * Monthly payout statement PDF (P2P), in Croatian or English.
 *
 * Uses DejaVu Sans (bundled under src/assets/fonts) so Croatian diacritics
 * (č ć đ š ž) render correctly; falls back to Helvetica if the font files
 * are missing.
 */

interface StatementLabels {
  title: string
  period: string
  reference: string
  generatedAt: string
  platform: string
  host: string
  oib: string
  iban: string
  bookings: string
  booking: string
  vehicle: string
  from: string
  to: string
  gross: string
  commissionPct: string
  commission: string
  share: string
  totals: string
  grossTotal: string
  commissionTotal: string
  shareTotal: string
  guaranteedMinimum: string
  minimumTopUp: string
  amountDue: string
  noBookings: string
  vatNote: string
  page: string
}

const LABELS: Record<'en' | 'hr', StatementLabels> = {
  en: {
    title: 'PAYOUT STATEMENT',
    period: 'Period',
    reference: 'Reference',
    generatedAt: 'Generated on',
    platform: 'Platform',
    host: 'Host',
    oib: 'OIB',
    iban: 'IBAN',
    bookings: 'Bookings',
    booking: 'Booking',
    vehicle: 'Vehicle',
    from: 'From',
    to: 'To',
    gross: 'Gross',
    commissionPct: 'Comm. %',
    commission: 'Commission',
    share: 'Host share',
    totals: 'Totals',
    grossTotal: 'Gross revenue',
    commissionTotal: 'Platform commission',
    shareTotal: 'Revenue share',
    guaranteedMinimum: 'Guaranteed monthly minimum',
    minimumTopUp: 'Minimum top-up',
    amountDue: 'PAYOUT AMOUNT',
    noBookings: 'No completed bookings in this period.',
    vatNote: 'The platform commission includes VAT where applicable.',
    page: 'Page',
  },
  hr: {
    title: 'OBRAČUN ISPLATE',
    period: 'Razdoblje',
    reference: 'Referenca',
    generatedAt: 'Datum izrade',
    platform: 'Platforma',
    host: 'Domaćin',
    oib: 'OIB',
    iban: 'IBAN',
    bookings: 'Rezervacije',
    booking: 'Rezervacija',
    vehicle: 'Vozilo',
    from: 'Od',
    to: 'Do',
    gross: 'Bruto',
    commissionPct: 'Prov. %',
    commission: 'Provizija',
    share: 'Udio domaćina',
    totals: 'Ukupno',
    grossTotal: 'Bruto prihod',
    commissionTotal: 'Provizija platforme',
    shareTotal: 'Udio u prihodu',
    guaranteedMinimum: 'Zajamčeni mjesečni minimum',
    minimumTopUp: 'Dodatak do minimuma',
    amountDue: 'IZNOS ISPLATE',
    noBookings: 'Nema dovršenih rezervacija u ovom razdoblju.',
    vatNote: 'Provizija platforme uključuje PDV gdje je primjenjivo.',
    page: 'Stranica',
  },
}

export interface StatementEntry {
  bookingId: string
  carName: string
  from: Date
  to: Date
  gross: number
  commissionPct: number
  commission: number
  share: number
}

export interface StatementData {
  language: 'en' | 'hr'
  year: number
  month: number
  reference: string
  hostName: string
  hostAddress?: string
  hostOib?: string
  hostIban?: string
  entries: StatementEntry[]
  grossTotal: number
  commissionTotal: number
  shareTotal: number
  guaranteedMinimum: number
  amount: number
}

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf')
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf')

const eur = (value: number) => `${value.toFixed(2)} €`
const dateStr = (date: Date) => {
  const d = new Date(date)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`
}

/**
 * Generate a payout statement PDF.
 *
 * @export
 * @async
 * @param {StatementData} data
 * @param {string} filepath
 * @returns {Promise<void>}
 */
export const generateStatementPDF = async (data: StatementData, filepath: string): Promise<void> => {
  const labels = LABELS[data.language]
  const hasUnicodeFonts = await helper.pathExists(FONT_REGULAR) && await helper.pathExists(FONT_BOLD)

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
  const regular = hasUnicodeFonts ? FONT_REGULAR : 'Helvetica'
  const bold = hasUnicodeFonts ? FONT_BOLD : 'Helvetica-Bold'

  const stream = fs.createWriteStream(filepath)
  doc.pipe(stream)

  const textColor = '#1f2937'
  const grayColor = '#6b7280'
  const lineColor = '#d1d5db'

  // header — platform identity
  doc.font(bold).fontSize(16).fillColor(textColor).text(env.PLATFORM_NAME, 50, 50)
  doc.font(regular).fontSize(9).fillColor(grayColor)
  let y = 72
  const platformLines = [
    env.PLATFORM_ADDRESS && `${env.PLATFORM_ADDRESS}, ${env.PLATFORM_ZIP} ${env.PLATFORM_CITY}`,
    env.PLATFORM_OIB && `${labels.oib}: ${env.PLATFORM_OIB}`,
    env.PLATFORM_IBAN && `${labels.iban}: ${env.PLATFORM_IBAN}`,
    env.PLATFORM_EMAIL,
  ].filter(Boolean) as string[]
  for (const line of platformLines) {
    doc.text(line, 50, y)
    y += 12
  }

  // title block (right)
  doc.font(bold).fontSize(15).fillColor(textColor).text(labels.title, 300, 50, { width: 245, align: 'right' })
  doc.font(regular).fontSize(9).fillColor(grayColor)
  doc.text(`${labels.period}: ${String(data.month).padStart(2, '0')}/${data.year}`, 300, 74, { width: 245, align: 'right' })
  doc.text(`${labels.reference}: ${data.reference}`, 300, 86, { width: 245, align: 'right' })
  doc.text(`${labels.generatedAt}: ${dateStr(new Date())}`, 300, 98, { width: 245, align: 'right' })

  // host block
  y = Math.max(y, 110) + 20
  doc.font(bold).fontSize(10).fillColor(textColor).text(`${labels.host}:`, 50, y)
  doc.font(regular).fontSize(10)
  y += 15
  doc.text(data.hostName, 50, y)
  y += 13
  if (data.hostAddress) {
    doc.text(data.hostAddress, 50, y)
    y += 13
  }
  if (data.hostOib) {
    doc.text(`${labels.oib}: ${data.hostOib}`, 50, y)
    y += 13
  }
  if (data.hostIban) {
    doc.text(`${labels.iban}: ${data.hostIban}`, 50, y)
    y += 13
  }

  // bookings table
  y += 15
  doc.font(bold).fontSize(11).fillColor(textColor).text(`${labels.bookings} (${data.entries.length})`, 50, y)
  y += 18

  const cols = {
    booking: { x: 50, width: 78 },
    vehicle: { x: 128, width: 122 },
    from: { x: 250, width: 55 },
    to: { x: 305, width: 55 },
    gross: { x: 360, width: 60 },
    pct: { x: 420, width: 40 },
    share: { x: 460, width: 85 },
  }

  const tableHeader = () => {
    doc.font(bold).fontSize(8).fillColor(grayColor)
    doc.text(labels.booking, cols.booking.x, y, { width: cols.booking.width })
    doc.text(labels.vehicle, cols.vehicle.x, y, { width: cols.vehicle.width })
    doc.text(labels.from, cols.from.x, y, { width: cols.from.width })
    doc.text(labels.to, cols.to.x, y, { width: cols.to.width })
    doc.text(labels.gross, cols.gross.x, y, { width: cols.gross.width, align: 'right' })
    doc.text(labels.commissionPct, cols.pct.x, y, { width: cols.pct.width, align: 'right' })
    doc.text(labels.share, cols.share.x, y, { width: cols.share.width, align: 'right' })
    y += 12
    doc.moveTo(50, y).lineTo(545, y).strokeColor(lineColor).stroke()
    y += 6
  }

  if (data.entries.length === 0) {
    doc.font(regular).fontSize(10).fillColor(grayColor).text(labels.noBookings, 50, y)
    y += 20
  } else {
    tableHeader()
    doc.font(regular).fontSize(8).fillColor(textColor)
    for (const entry of data.entries) {
      if (y > 760) {
        doc.addPage()
        y = 50
        tableHeader()
        doc.font(regular).fontSize(8).fillColor(textColor)
      }
      doc.text(entry.bookingId.substring(entry.bookingId.length - 8).toUpperCase(), cols.booking.x, y, { width: cols.booking.width })
      doc.text(entry.carName, cols.vehicle.x, y, { width: cols.vehicle.width, ellipsis: true, height: 12 })
      doc.text(dateStr(entry.from), cols.from.x, y, { width: cols.from.width })
      doc.text(dateStr(entry.to), cols.to.x, y, { width: cols.to.width })
      doc.text(eur(entry.gross), cols.gross.x, y, { width: cols.gross.width, align: 'right' })
      doc.text(`${entry.commissionPct}%`, cols.pct.x, y, { width: cols.pct.width, align: 'right' })
      doc.text(eur(entry.share), cols.share.x, y, { width: cols.share.width, align: 'right' })
      y += 14
    }
    doc.moveTo(50, y).lineTo(545, y).strokeColor(lineColor).stroke()
    y += 10
  }

  // totals
  if (y > 680) {
    doc.addPage()
    y = 50
  }
  const totalLine = (label: string, value: string, emphasized = false) => {
    doc.font(emphasized ? bold : regular).fontSize(emphasized ? 11 : 9).fillColor(textColor)
    doc.text(label, 300, y, { width: 160 })
    doc.text(value, 460, y, { width: 85, align: 'right' })
    y += emphasized ? 18 : 14
  }

  totalLine(labels.grossTotal, eur(data.grossTotal))
  totalLine(labels.commissionTotal, `- ${eur(data.commissionTotal)}`)
  totalLine(labels.shareTotal, eur(data.shareTotal))
  if (data.guaranteedMinimum > 0) {
    totalLine(labels.guaranteedMinimum, eur(data.guaranteedMinimum))
    const topUp = Math.max(0, data.amount - data.shareTotal)
    if (topUp > 0) {
      totalLine(labels.minimumTopUp, `+ ${eur(topUp)}`)
    }
  }
  y += 4
  doc.moveTo(300, y).lineTo(545, y).strokeColor(lineColor).stroke()
  y += 8
  totalLine(labels.amountDue, eur(data.amount), true)

  // footer note
  y += 10
  doc.font(regular).fontSize(8).fillColor(grayColor).text(labels.vatNote, 50, y, { width: 495 })

  doc.end()

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve())
    stream.on('error', (err) => reject(err))
  })
}
