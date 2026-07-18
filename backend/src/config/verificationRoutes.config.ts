const routes = {
  createDocument: '/api/create-verification-document/:type',
  deleteTempDocument: '/api/delete-temp-verification-document/:type/:file',
  submit: '/api/submit-verification',
  getVerification: '/api/verification',
  getDocument: '/api/verification-document/:userId/:type',
  getVerifications: '/api/verifications/:page/:size',
  review: '/api/review-verification/:id',
}

export default routes
