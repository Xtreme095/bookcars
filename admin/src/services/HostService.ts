import * as bookcarsTypes from ':bookcars-types'
import axiosInstance from './axiosInstance'

/**
 * Get hosts (paginated, filterable by status and keyword).
 *
 * @param {bookcarsTypes.GetHostsBody} data
 * @param {string} keyword
 * @param {number} page
 * @param {number} size
 * @returns {Promise<bookcarsTypes.Result<bookcarsTypes.User>>}
 */
export const getHosts = (data: bookcarsTypes.GetHostsBody, keyword: string, page: number, size: number): Promise<bookcarsTypes.Result<bookcarsTypes.User>> =>
  axiosInstance
    .post(
      `/api/hosts/${page}/${size}/?s=${encodeURIComponent(keyword)}`,
      data,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Get a host by user id.
 *
 * @param {string} id
 * @returns {Promise<bookcarsTypes.User>}
 */
export const getHost = (id: string): Promise<bookcarsTypes.User> =>
  axiosInstance
    .get(
      `/api/host/${encodeURIComponent(id)}`,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Review a host application (approve, reject, suspend or reactivate).
 *
 * @param {string} id
 * @param {bookcarsTypes.ReviewHostPayload} data
 * @returns {Promise<number>}
 */
export const reviewHost = (id: string, data: bookcarsTypes.ReviewHostPayload): Promise<number> =>
  axiosInstance
    .post(
      `/api/review-host/${encodeURIComponent(id)}`,
      data,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Fetch a host identity document as a Blob (streamed by the API).
 *
 * @param {string} userId
 * @param {bookcarsTypes.HostDocumentType} type
 * @returns {Promise<Blob>}
 */
export const getHostDocument = (userId: string, type: bookcarsTypes.HostDocumentType): Promise<Blob> =>
  axiosInstance
    .get(
      `/api/host-document/${encodeURIComponent(userId)}/${type}`,
      { withCredentials: true, responseType: 'blob' }
    )
    .then((res) => res.data)
