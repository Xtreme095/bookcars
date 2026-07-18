import * as env from '../config/env.config'
import manualProvider from './manualProvider'
import { VerificationProvider } from './verificationProvider'

const providers: Record<string, VerificationProvider> = {
  manual: manualProvider,
  // register third-party KYC providers here, e.g.:
  // veriff: veriffProvider,
}

/**
 * Resolve the configured verification provider (BC_VERIFICATION_PROVIDER,
 * default 'manual').
 *
 * @export
 * @returns {VerificationProvider}
 */
export const getProvider = (): VerificationProvider => providers[env.VERIFICATION_PROVIDER] || manualProvider
