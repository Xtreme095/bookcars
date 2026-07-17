import * as bookcarsTypes from ':bookcars-types'
import axiosInstance from './axiosInstance'

/**
 * Apply to become a host (or re-apply / edit a pending application).
 *
 * @param {bookcarsTypes.ApplyToHostPayload} data
 * @returns {Promise<number>}
 */
export const apply = (data: bookcarsTypes.ApplyToHostPayload): Promise<number> =>
  axiosInstance
    .post(
      '/api/apply-to-host',
      data,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Get the current user's host application/profile.
 *
 * @returns {Promise<bookcarsTypes.HostProfile | null>}
 */
export const getHostApplication = (): Promise<bookcarsTypes.HostProfile | null> =>
  axiosInstance
    .get(
      '/api/host-application',
      { withCredentials: true }
    )
    .then((res) => (res.status === 204 ? null : res.data))

/**
 * Upload a host identity document to the temp folder.
 *
 * @param {bookcarsTypes.HostDocumentType} type
 * @param {Blob} file
 * @returns {Promise<string>}
 */
export const createHostDocument = (type: bookcarsTypes.HostDocumentType, file: Blob): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)

  return axiosInstance
    .post(
      `/api/create-host-document/${type}`,
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
 * Delete a temp host document.
 *
 * @param {bookcarsTypes.HostDocumentType} type
 * @param {string} file
 * @returns {Promise<number>}
 */
export const deleteTempHostDocument = (type: bookcarsTypes.HostDocumentType, file: string): Promise<number> =>
  axiosInstance
    .post(
      `/api/delete-temp-host-document/${type}/${encodeURIComponent(file)}`,
      null,
      { withCredentials: true }
    )
    .then((res) => res.status)
