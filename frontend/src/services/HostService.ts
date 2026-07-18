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

/**
 * Create a host car (draft).
 *
 * @param {bookcarsTypes.UpsertHostCarPayload} data
 * @returns {Promise<bookcarsTypes.Car>}
 */
export const createHostCar = (data: bookcarsTypes.UpsertHostCarPayload): Promise<bookcarsTypes.Car> =>
  axiosInstance
    .post(
      '/api/create-host-car',
      data,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Update a host car.
 *
 * @param {bookcarsTypes.UpsertHostCarPayload} data
 * @returns {Promise<bookcarsTypes.Car>}
 */
export const updateHostCar = (data: bookcarsTypes.UpsertHostCarPayload): Promise<bookcarsTypes.Car> =>
  axiosInstance
    .put(
      '/api/update-host-car',
      data,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Submit a host car for review.
 *
 * @param {string} id
 * @returns {Promise<number>}
 */
export const submitHostCar = (id: string): Promise<number> =>
  axiosInstance
    .post(
      `/api/submit-host-car/${encodeURIComponent(id)}`,
      null,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Delete a host car.
 *
 * @param {string} id
 * @returns {Promise<number>}
 */
export const deleteHostCar = (id: string): Promise<number> =>
  axiosInstance
    .post(
      `/api/delete-host-car/${encodeURIComponent(id)}`,
      null,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Get a host car.
 *
 * @param {string} id
 * @returns {Promise<bookcarsTypes.Car | null>}
 */
export const getHostCar = (id: string): Promise<bookcarsTypes.Car | null> =>
  axiosInstance
    .get(
      `/api/host-car/${encodeURIComponent(id)}`,
      { withCredentials: true }
    )
    .then((res) => (res.status === 204 ? null : res.data))

/**
 * Get the host's cars (paginated).
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
      `/api/host-cars/${page}/${size}/?s=${encodeURIComponent(keyword)}`,
      data,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Upload a car image to the temp folder.
 *
 * @param {Blob} file
 * @returns {Promise<string>}
 */
export const createHostCarImage = (file: Blob): Promise<string> => {
  const formData = new FormData()
  formData.append('image', file)

  return axiosInstance
    .post(
      '/api/create-host-car-image',
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
 * Delete a temp car image.
 *
 * @param {string} image
 * @returns {Promise<number>}
 */
export const deleteTempHostCarImage = (image: string): Promise<number> =>
  axiosInstance
    .post(
      `/api/delete-temp-host-car-image/${encodeURIComponent(image)}`,
      null,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Create a car unavailability period.
 *
 * @param {bookcarsTypes.UpsertCarUnavailabilityPayload} data
 * @returns {Promise<bookcarsTypes.CarUnavailability>}
 */
export const createCarUnavailability = (data: bookcarsTypes.UpsertCarUnavailabilityPayload): Promise<bookcarsTypes.CarUnavailability> =>
  axiosInstance
    .post(
      '/api/create-car-unavailability',
      data,
      { withCredentials: true }
    )
    .then((res) => res.data)

/**
 * Delete a car unavailability period.
 *
 * @param {string} id
 * @returns {Promise<number>}
 */
export const deleteCarUnavailability = (id: string): Promise<number> =>
  axiosInstance
    .post(
      `/api/delete-car-unavailability/${encodeURIComponent(id)}`,
      null,
      { withCredentials: true }
    )
    .then((res) => res.status)

/**
 * Get a car's unavailability periods.
 *
 * @param {string} carId
 * @returns {Promise<bookcarsTypes.CarUnavailability[]>}
 */
export const getCarUnavailabilities = (carId: string): Promise<bookcarsTypes.CarUnavailability[]> =>
  axiosInstance
    .get(
      `/api/car-unavailabilities/${encodeURIComponent(carId)}`,
      { withCredentials: true }
    )
    .then((res) => (res.status === 204 ? [] : res.data))
