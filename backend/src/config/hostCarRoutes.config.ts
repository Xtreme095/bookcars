const routes = {
  create: '/api/create-host-car',
  update: '/api/update-host-car',
  submit: '/api/submit-host-car/:id',
  delete: '/api/delete-host-car/:id',
  getHostCar: '/api/host-car/:id',
  getHostCars: '/api/host-cars/:page/:size',
  createImage: '/api/create-host-car-image',
  deleteTempImage: '/api/delete-temp-host-car-image/:image',
  getRegistrationDocument: '/api/car-registration-document/:carId',
  createUnavailability: '/api/create-car-unavailability',
  deleteUnavailability: '/api/delete-car-unavailability/:id',
  getUnavailabilities: '/api/car-unavailabilities/:carId',
  getAdminHostCars: '/api/admin-host-cars/:page/:size',
  review: '/api/review-host-car/:id',
}

export default routes
