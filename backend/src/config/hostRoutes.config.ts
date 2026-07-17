const routes = {
  apply: '/api/apply-to-host',
  getHostApplication: '/api/host-application',
  createHostDocument: '/api/create-host-document/:type',
  deleteTempHostDocument: '/api/delete-temp-host-document/:type/:file',
  getHostDocument: '/api/host-document/:userId/:type',
  getHosts: '/api/hosts/:page/:size',
  getHost: '/api/host/:id',
  reviewHost: '/api/review-host/:id',
}

export default routes
