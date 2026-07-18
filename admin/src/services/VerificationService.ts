import * as bookcarsTypes from ':bookcars-types'
import axiosInstance from './axiosInstance'

/**
 * Get renter verifications (paginated, filterable by status and keyword).
 *
 * @param {bookcarsTypes.GetVerificationsBody} data
 * @param {string} keyword
 * @param {number} page
 * @param {number} size
 * @returns {Promise<bookcarsTypes.Result<bookcarsTypes.User>>}
 */
export const getVerifications = (data: bookcarsTypes.GetVerificationsBody, keyword: string, page: number, size: number): Promise<bookcarsTypes.Result<bookcarsTypes.User>> =>
  axiosInstance
    .post(
      `/api/verifications/${page}/${size}/?s=${encodeURIComponent(keyword)}`,
      data,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Review a renter verification (approve or reject).
 *
 * @param {string} id
 * @param {bookcarsTypes.ReviewVerificationPayload} data
 * @returns {Promise<number>}
 */
export const reviewVerification = (id: string, data: bookcarsTypes.ReviewVerificationPayload): Promise<number> =>
  axiosInstance
    .post(
      `/api/review-verification/${encodeURIComponent(id)}`,
      data,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Fetch a renter verification document as a Blob (streamed by the API).
 *
 * @param {string} userId
 * @param {bookcarsTypes.RenterDocumentType} type
 * @returns {Promise<Blob>}
 */
export const getVerificationDocument = (userId: string, type: bookcarsTypes.RenterDocumentType): Promise<Blob> =>
  axiosInstance
    .get(
      `/api/verification-document/${encodeURIComponent(userId)}/${type}`,
      { withCredentials: true, responseType: 'blob' }
    )
    .then((res) => res.data)
