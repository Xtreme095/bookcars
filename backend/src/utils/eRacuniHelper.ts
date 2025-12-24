import axios, { AxiosInstance } from 'axios'
import * as env from '../config/env.config'
import * as logger from './logger'

interface ERacuniConfig {
  apiUrl: string
  apiKey: string
  companyOib: string
  enabled: boolean
}

interface ERacuniInvoice {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string

  issuerName: string
  issuerOib: string
  issuerAddress: string
  issuerCity: string
  issuerZip: string
  issuerIban: string
  issuerEmail: string

  recipientName: string
  recipientOib: string
  recipientAddress: string
  recipientCity: string
  recipientZip: string
  recipientEmail: string

  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    total: number
    vatRate: number
    vatAmount: number
  }>

  subtotal: number
  totalVat: number
  total: number
  currency: string

  paymentMethod: string
  reference?: string
  notes?: string
}

interface ERacuniResponse {
  success: boolean
  invoiceId?: string
  jir?: string
  zki?: string
  message?: string
  errors?: string[]
}

export class ERacuniService {
  private client: AxiosInstance | null = null
  private config: ERacuniConfig

  constructor() {
    this.config = {
      apiUrl: process.env.BC_ERACUNI_API_URL || 'https://api.e-racuni.hr/v1',
      apiKey: process.env.BC_ERACUNI_API_KEY || '',
      companyOib: process.env.BC_ERACUNI_COMPANY_OIB || '',
      enabled: process.env.BC_ERACUNI_ENABLED === 'true',
    }

    if (this.config.enabled && this.config.apiKey) {
      this.client = axios.create({
        baseURL: this.config.apiUrl,
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 30000,
      })
    }
  }

  async sendInvoice(invoice: ERacuniInvoice): Promise<ERacuniResponse> {
    if (!this.config.enabled) {
      logger.info('e-Računi integration disabled, skipping invoice submission')
      return {
        success: true,
        message: 'e-Računi integration disabled',
      }
    }

    if (!this.client) {
      logger.error('e-Računi client not initialized')
      return {
        success: false,
        message: 'e-Računi client not configured',
        errors: ['API key or configuration missing'],
      }
    }

    try {
      logger.info('Sending invoice to e-Računi', { invoiceNumber: invoice.invoiceNumber })

      const payload = this.buildInvoicePayload(invoice)

      const response = await this.client.post('/invoices', payload)

      if (response.data.success) {
        logger.info('Invoice sent to e-Računi successfully', {
          invoiceNumber: invoice.invoiceNumber,
          invoiceId: response.data.invoiceId,
          jir: response.data.jir,
        })

        return {
          success: true,
          invoiceId: response.data.invoiceId,
          jir: response.data.jir,
          zki: response.data.zki,
        }
      }

      logger.error('e-Računi API returned error', { response: response.data })
      return {
        success: false,
        message: response.data.message || 'Unknown error',
        errors: response.data.errors,
      }
    } catch (err: any) {
      logger.error('Failed to send invoice to e-Računi', err)
      return {
        success: false,
        message: err.message || 'Network error',
        errors: [err.response?.data?.message || err.message],
      }
    }
  }

  async getInvoiceStatus(invoiceId: string): Promise<any> {
    if (!this.client) {
      throw new Error('e-Računi client not configured')
    }

    try {
      const response = await this.client.get(`/invoices/${invoiceId}`)
      return response.data
    } catch (err) {
      logger.error('Failed to get invoice status from e-Računi', err)
      throw err
    }
  }

  async cancelInvoice(invoiceId: string, reason: string): Promise<ERacuniResponse> {
    if (!this.client) {
      throw new Error('e-Računi client not configured')
    }

    try {
      const response = await this.client.post(`/invoices/${invoiceId}/cancel`, { reason })
      return response.data
    } catch (err) {
      logger.error('Failed to cancel invoice in e-Računi', err)
      throw err
    }
  }

  private buildInvoicePayload(invoice: ERacuniInvoice): any {
    return {
      type: 'R1',
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,

      issuer: {
        name: invoice.issuerName,
        oib: invoice.issuerOib,
        address: {
          street: invoice.issuerAddress,
          city: invoice.issuerCity,
          zip: invoice.issuerZip,
        },
        iban: invoice.issuerIban,
        email: invoice.issuerEmail,
        vatSystem: true,
      },

      recipient: {
        name: invoice.recipientName,
        oib: invoice.recipientOib,
        address: {
          street: invoice.recipientAddress,
          city: invoice.recipientCity,
          zip: invoice.recipientZip,
        },
        email: invoice.recipientEmail,
      },

      items: invoice.items.map((item, index) => ({
        ordinal: index + 1,
        description: item.description,
        quantity: item.quantity,
        unitOfMeasure: 'kom',
        unitPrice: item.unitPrice,
        totalWithoutVat: item.total - item.vatAmount,
        vatRate: item.vatRate,
        vatAmount: item.vatAmount,
        total: item.total,
      })),

      summary: {
        subtotal: invoice.subtotal,
        totalVat: invoice.totalVat,
        total: invoice.total,
      },

      payment: {
        method: this.mapPaymentMethod(invoice.paymentMethod),
        iban: invoice.issuerIban,
      },

      reference: invoice.reference,
      notes: invoice.notes,

      sendEmail: true,
      recipientEmail: invoice.recipientEmail,
    }
  }

  private mapPaymentMethod(method: string): string {
    const mapping: Record<string, string> = {
      'bank_transfer': 'BANKTRANSFER',
      'card': 'CARD',
      'cash': 'CASH',
      'online': 'ONLINE',
    }
    return mapping[method] || 'BANKTRANSFER'
  }

  isEnabled(): boolean {
    return this.config.enabled
  }
}

export const eRacuniService = new ERacuniService()

export const createInvoiceForCommission = async (
  commissionTransaction: any,
  supplier: any,
  platformInfo: any,
): Promise<{ pdfPath?: string, eRacuniResponse?: ERacuniResponse }> => {
  try {
    const invoiceData: ERacuniInvoice = {
      invoiceNumber: commissionTransaction.invoiceNumber,
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],

      issuerName: platformInfo.name,
      issuerOib: platformInfo.oib,
      issuerAddress: platformInfo.address,
      issuerCity: platformInfo.city,
      issuerZip: platformInfo.zip,
      issuerIban: platformInfo.iban,
      issuerEmail: platformInfo.email,

      recipientName: supplier.fullName || supplier.companyName,
      recipientOib: supplier.oib,
      recipientAddress: supplier.address || supplier.companyAddress,
      recipientCity: supplier.city || supplier.companyCity,
      recipientZip: supplier.zip || supplier.companyZip,
      recipientEmail: supplier.email,

      items: [
        {
          description: `Provizija za rezervaciju - ${commissionTransaction.invoiceNumber}`,
          quantity: 1,
          unitPrice: commissionTransaction.platformCommission,
          total: commissionTransaction.platformCommission,
          vatRate: commissionTransaction.pdvRate,
          vatAmount: commissionTransaction.pdvAmount,
        },
      ],

      subtotal: commissionTransaction.platformCommission - commissionTransaction.pdvAmount,
      totalVat: commissionTransaction.pdvAmount,
      total: commissionTransaction.platformCommission,
      currency: 'EUR',

      paymentMethod: commissionTransaction.payoutMethod || 'bank_transfer',
      reference: commissionTransaction.booking?.toString(),
      notes: `Naknada za rezervaciju. Neto prihod: ${env.formatCurrency(commissionTransaction.netRevenue)}`,
    }

    let eRacuniResponse: ERacuniResponse | undefined
    if (eRacuniService.isEnabled()) {
      eRacuniResponse = await eRacuniService.sendInvoice(invoiceData)

      if (!eRacuniResponse.success) {
        logger.error('Failed to send invoice to e-Računi', {
          invoiceNumber: commissionTransaction.invoiceNumber,
          errors: eRacuniResponse.errors,
        })
      }
    }

    return { eRacuniResponse }
  } catch (err) {
    logger.error('Failed to create invoice for commission', err)
    throw err
  }
}
