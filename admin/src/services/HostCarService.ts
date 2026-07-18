import * as bookcarsTypes from ':bookcars-types'
import axiosInstance from './axiosInstance'

/**
 * Get host cars for the review queue (paginated, filterable by status).
 *
 * @param {bookcarsTypes.GetHostCarsBody} data
 * @param {string} keyword
 * @param {number} page
 * @param {number} size
 * @returns {Promise<bookcarsTypes.Result<bookcarsTypes.Car>>}
 */
export const getHostCars = (data: bookcarsTypes.GetHostCarsBody, keyword: string, page: number, size: number): Promise<bookcarsTypes.Result<bookcarsTypes.Car>> =>
  axiosInstance
    .post(
      `/api/admin-host-cars/${page}/${size}/?s=${encodeURIComponent(keyword)}`,
      data,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Review a host car (approve, reject, suspend or reactivate).
 *
 * @param {string} id
 * @param {bookcarsTypes.ReviewCarPayload} data
 * @returns {Promise<number>}
 */
export const reviewHostCar = (id: string, data: bookcarsTypes.ReviewCarPayload): Promise<number> =>
  axiosInstance
    .post(
      `/api/review-host-car/${encodeURIComponent(id)}`,
      data,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Fetch a car's registration document as a Blob (streamed by the API).
 *
 * @param {string} carId
 * @returns {Promise<Blob>}
 */
export const getCarRegistrationDocument = (carId: string): Promise<Blob> =>
  axiosInstance
    .get(
      `/api/car-registration-document/${encodeURIComponent(carId)}`,
      { withCredentials: true, responseType: 'blob' }
    )
    .then((res) => res.data)
