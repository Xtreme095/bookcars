const routes = {
  generate: '/api/generate-payouts/:year/:month',
  getPayouts: '/api/payouts/:page/:size',
  getHostPayouts: '/api/host-payouts',
  markPaid: '/api/mark-payout-paid/:id',
  exportSepa: '/api/payouts-sepa/:year/:month',
  getStatement: '/api/payout-statement/:id',
}

export default routes
