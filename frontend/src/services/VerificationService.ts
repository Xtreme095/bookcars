import * as bookcarsTypes from ':bookcars-types'
import axiosInstance from './axiosInstance'

/**
 * Upload a renter verification document to the temp folder.
 *
 * @param {bookcarsTypes.RenterDocumentType} type
 * @param {Blob} file
 * @returns {Promise<string>}
 */
export const createVerificationDocument = (type: bookcarsTypes.RenterDocumentType, file: Blob): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)

  return axiosInstance
    .post(
      `/api/create-verification-document/${type}`,
      formData,
      {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    .then((res) => res.data)
}

/**
 * Delete a temp verification document.
 *
 * @param {bookcarsTypes.RenterDocumentType} type
 * @param {string} file
 * @returns {Promise<number>}
 */
export const deleteTempVerificationDocument = (type: bookcarsTypes.RenterDocumentType, file: string): Promise<number> =>
  axiosInstance
    .post(
      `/api/delete-temp-verification-document/${type}/${encodeURIComponent(file)}`,
      null,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Submit renter verification documents (or re-submit after rejection).
 *
 * @param {bookcarsTypes.SubmitVerificationPayload} data
 * @returns {Promise<bookcarsTypes.RenterVerification>}
 */
export const submitVerification = (data: bookcarsTypes.SubmitVerificationPayload): Promise<bookcarsTypes.RenterVerification> =>
  axiosInstance
    .post(
      '/api/submit-verification',
      data,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Get the current user's verification state.
 *
 * @returns {Promise<bookcarsTypes.RenterVerificationInfo | null>}
 */
export const getVerification = (): Promise<bookcarsTypes.RenterVerificationInfo | null> =>
  axiosInstance
    .get(
      '/api/verification',
      { withCredentials: true }
    )
    .then((res) => (res.status === 204 ? null : res.data))
