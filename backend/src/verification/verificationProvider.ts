import * as bookcarsTypes from ':bookcars-types'
import * as env from '../config/env.config'

/**
 * Renter identity verification provider interface (P2P).
 *
 * The default implementation is manual admin review. A third-party KYC
 * vendor can be plugged in by implementing this interface and registering
 * it in `verification/index.ts` (BC_VERIFICATION_PROVIDER): `submit` may
 * return 'approved' synchronously, or 'pending' and resolve the check later
 * (e.g. via a vendor webhook that calls `applyDecision`).
 */
export interface VerificationProvider {
  name: string

  /**
   * Called when a renter submits their documents. Returns the initial
   * verification status.
   */
  submit: (user: env.User) => Promise<bookcarsTypes.VerificationStatus>
}
