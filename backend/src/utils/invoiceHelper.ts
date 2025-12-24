import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import * as env from '../config/env.config'
import * as logger from './logger'

interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
  vatRate: number
  vatAmount: number
}

interface InvoiceData {
  invoiceNumber: string
  invoiceDate: Date
  dueDate: Date

  supplierName: string
  supplierOib: string
  supplierAddress: string
  supplierCity: string
  supplierZip: string
  supplierIban: string
  supplierEmail: string

  platformName: string
  platformOib: string
  platformAddress: string
  platformCity: string
  platformZip: string
  platformIban: string
  platformEmail: string

  items: InvoiceItem[]
  subtotal: number
  totalVat: number
  total: number

  paymentMethod: string
  bookingReference?: string
  notes?: string
}

export const generateInvoicePDF = async (invoiceData: InvoiceData, outputPath: string): Promise<void> => {
  try {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const writeStream = fs.createWriteStream(outputPath)
    doc.pipe(writeStream)

    const primaryColor = '#2563eb'
    const textColor = '#1f2937'
    const grayColor = '#6b7280'

    doc.font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(primaryColor)
      .text('RAČUN', 50, 50)

    doc.fontSize(10)
      .fillColor(grayColor)
      .text(`Broj računa: ${invoiceData.invoiceNumber}`, 50, 90)
      .text(`Datum izdavanja: ${formatDate(invoiceData.invoiceDate)}`, 50, 105)
      .text(`Datum dospijeća: ${formatDate(invoiceData.dueDate)}`, 50, 120)

    const qrData = `HRVHUB30\nHRK\n${invoiceData.total.toFixed(2)}\n${invoiceData.platformName}\n${invoiceData.platformIban}\n${invoiceData.supplierName}\n${invoiceData.supplierIban}\n${invoiceData.invoiceNumber}`
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, { width: 120, margin: 1 })
    const qrBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64')
    doc.image(qrBuffer, 450, 50, { width: 100 })

    doc.fontSize(10)
      .fillColor(textColor)
      .font('Helvetica-Bold')
      .text('Izdavatelj:', 50, 170)

    doc.font('Helvetica')
      .text(invoiceData.platformName, 50, 185)
      .text(`OIB: ${invoiceData.platformOib}`, 50, 200)
      .text(invoiceData.platformAddress, 50, 215)
      .text(`${invoiceData.platformZip} ${invoiceData.platformCity}`, 50, 230)
      .text(`IBAN: ${invoiceData.platformIban}`, 50, 245)
      .text(invoiceData.platformEmail, 50, 260)

    doc.font('Helvetica-Bold')
      .text('Primatelj:', 320, 170)

    doc.font('Helvetica')
      .text(invoiceData.supplierName, 320, 185)
      .text(`OIB: ${invoiceData.supplierOib}`, 320, 200)
      .text(invoiceData.supplierAddress, 320, 215)
      .text(`${invoiceData.supplierZip} ${invoiceData.supplierCity}`, 320, 230)
      .text(invoiceData.supplierEmail, 320, 245)

    if (invoiceData.bookingReference) {
      doc.font('Helvetica')
        .fontSize(9)
        .fillColor(grayColor)
        .text(`Referenca: ${invoiceData.bookingReference}`, 50, 280)
    }

    const tableTop = 320
    doc.font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#ffffff')

    doc.rect(50, tableTop, 495, 25).fill(primaryColor)

    doc.text('Opis', 60, tableTop + 8, { width: 200 })
    doc.text('Kol.', 270, tableTop + 8, { width: 40, align: 'right' })
    doc.text('Cijena', 320, tableTop + 8, { width: 60, align: 'right' })
    doc.text('PDV', 390, tableTop + 8, { width: 50, align: 'right' })
    doc.text('Ukupno', 450, tableTop + 8, { width: 85, align: 'right' })

    let yPosition = tableTop + 35
    doc.font('Helvetica')
      .fontSize(9)
      .fillColor(textColor)

    invoiceData.items.forEach((item, index) => {
      const bgColor = index % 2 === 0 ? '#f9fafb' : '#ffffff'
      doc.rect(50, yPosition - 5, 495, 20).fill(bgColor)

      doc.fillColor(textColor)
        .text(item.description, 60, yPosition, { width: 200 })
        .text(item.quantity.toString(), 270, yPosition, { width: 40, align: 'right' })
        .text(`${env.formatCurrency(item.unitPrice)}`, 320, yPosition, { width: 60, align: 'right' })
        .text(`${item.vatRate}%`, 390, yPosition, { width: 50, align: 'right' })
        .text(`${env.formatCurrency(item.total)}`, 450, yPosition, { width: 85, align: 'right' })

      yPosition += 20
    })

    yPosition += 20
    doc.font('Helvetica')
      .fontSize(10)
      .text('Osnovica:', 350, yPosition, { width: 90, align: 'right' })
      .text(`${env.formatCurrency(invoiceData.subtotal)}`, 450, yPosition, { width: 85, align: 'right' })

    yPosition += 20
    doc.text('PDV (25%):', 350, yPosition, { width: 90, align: 'right' })
      .text(`${env.formatCurrency(invoiceData.totalVat)}`, 450, yPosition, { width: 85, align: 'right' })

    yPosition += 5
    doc.moveTo(350, yPosition).lineTo(545, yPosition).stroke()

    yPosition += 15
    doc.font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(primaryColor)
      .text('UKUPNO ZA UPLATU:', 350, yPosition, { width: 90, align: 'right' })
      .text(`${env.formatCurrency(invoiceData.total)}`, 450, yPosition, { width: 85, align: 'right' })

    if (invoiceData.notes) {
      yPosition += 40
      doc.font('Helvetica')
        .fontSize(9)
        .fillColor(grayColor)
        .text('Napomena:', 50, yPosition)
        .text(invoiceData.notes, 50, yPosition + 15, { width: 495 })
    }

    const footerY = 750
    doc.fontSize(8)
      .fillColor(grayColor)
      .text(`Način plaćanja: ${invoiceData.paymentMethod}`, 50, footerY, { align: 'center', width: 495 })
      .text('Izdavatelj je u sustavu PDV-a. Račun je izdan elektronički i ne zahtijeva potpis.', 50, footerY + 15, { align: 'center', width: 495 })
      .text(`Generirano: ${formatDateTime(new Date())}`, 50, footerY + 30, { align: 'center', width: 495 })

    doc.end()

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    logger.info('Invoice PDF generated successfully', { invoiceNumber: invoiceData.invoiceNumber, outputPath })
  } catch (err) {
    logger.error('Failed to generate invoice PDF', err)
    throw err
  }
}

const formatDate = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

const formatDateTime = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${day}.${month}.${year}. ${hours}:${minutes}`
}

export const generateInvoiceFilename = (invoiceNumber: string): string => {
  const sanitized = invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '_')
  return `invoice_${sanitized}.pdf`
}
