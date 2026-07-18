import * as bookcarsTypes from ':bookcars-types'
import axiosInstance from './axiosInstance'

/**
 * Generate (or regenerate) monthly payouts.
 *
 * @param {number} year
 * @param {number} month
 * @returns {Promise<{ generated: number, skippedPaid: number }>}
 */
export const generatePayouts = (year: number, month: number): Promise<{ generated: number, skippedPaid: number }> =>
  axiosInstance
    .post(
      `/api/generate-payouts/${year}/${month}`,
      null,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Get payouts of a period.
 *
 * @param {bookcarsTypes.GetPayoutsBody} data
 * @param {number} page
 * @param {number} size
 * @returns {Promise<bookcarsTypes.Result<bookcarsTypes.Payout>>}
 */
export const getPayouts = (data: bookcarsTypes.GetPayoutsBody, page: number, size: number): Promise<bookcarsTypes.Result<bookcarsTypes.Payout>> =>
  axiosInstance
    .post(
      `/api/payouts/${page}/${size}`,
      data,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Mark a payout as paid.
 *
 * @param {string} id
 * @param {bookcarsTypes.MarkPayoutPaidPayload} data
 * @returns {Promise<number>}
 */
export const markPayoutPaid = (id: string, data: bookcarsTypes.MarkPayoutPaidPayload): Promise<number> =>
  axiosInstance
    .post(
      `/api/mark-payout-paid/${encodeURIComponent(id)}`,
      data,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Download the SEPA CSV of a period.
 *
 * @param {number} year
 * @param {number} month
 * @returns {Promise<Blob>}
 */
export const exportSepaCsv = (year: number, month: number): Promise<Blob> =>
  axiosInstance
    .get(
      `/api/payouts-sepa/${year}/${month}`,
      { withCredentials: true, responseType: 'blob' }
    )
    .then((res) => res.data)

/**
 * Download a payout statement PDF.
 *
 * @param {string} id
 * @returns {Promise<Blob>}
 */
export const getPayoutStatement = (id: string): Promise<Blob> =>
  axiosInstance
    .get(
      `/api/payout-statement/${encodeURIComponent(id)}`,
      { withCredentials: true, responseType: 'blob' }
    )
    .then((res) => res.data)
