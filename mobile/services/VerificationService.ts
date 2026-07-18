import { Platform } from 'react-native'
import * as bookcarsTypes from ':bookcars-types'
import axiosInstance from './axiosInstance'
import * as UserService from './UserService'

/**
 * Upload a renter verification document to the temp folder.
 *
 * @param {bookcarsTypes.RenterDocumentType} type
 * @param {BlobInfo} file
 * @returns {Promise<string>}
 */
export const createVerificationDocument = async (type: bookcarsTypes.RenterDocumentType, file: BlobInfo): Promise<string> => {
  const uri = Platform.OS === 'android' ? file.uri : file.uri.replace('file://', '')
  const formData = new FormData()
  formData.append('file', {
    uri,
    name: file.name,
    type: file.type,
  } as any)

  const headers = await UserService.authHeader()
  return axiosInstance
    .post(
      `/api/create-verification-document/${type}`,
      formData,
      { headers: { ...headers, 'Content-Type': 'multipart/form-data' } },
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
export const deleteTempVerificationDocument = async (type: bookcarsTypes.RenterDocumentType, file: string): Promise<number> => {
  const headers = await UserService.authHeader()
  return axiosInstance
    .post(
      `/api/delete-temp-verification-document/${type}/${encodeURIComponent(file)}`,
      null,
      { headers },
    )
    .then((res) => res.status)
}

/**
 * Submit renter verification documents (or re-submit after rejection).
 *
 * @param {bookcarsTypes.SubmitVerificationPayload} data
 * @returns {Promise<bookcarsTypes.RenterVerification>}
 */
export const submitVerification = async (data: bookcarsTypes.SubmitVerificationPayload): Promise<bookcarsTypes.RenterVerification> => {
  const headers = await UserService.authHeader()
  return axiosInstance
    .post(
      '/api/submit-verification',
      data,
      { headers },
    )
    .then((res) => res.data)
}

/**
 * Get the current user's verification state.
 *
 * @returns {Promise<bookcarsTypes.RenterVerificationInfo | null>}
 */
export const getVerification = async (): Promise<bookcarsTypes.RenterVerificationInfo | null> => {
  const headers = await UserService.authHeader()
  return axiosInstance
    .get(
      '/api/verification',
      { headers },
    )
    .then((res) => (res.status === 204 ? null : res.data))
}
