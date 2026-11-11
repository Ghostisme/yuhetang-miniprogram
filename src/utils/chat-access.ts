import type { CustomerProfile } from '../types'

// wx.login alone only supplies an account identity. Contact details need separate consent.
export function canContactCustomerService(profile: CustomerProfile | null): boolean {
  return !!profile?.complete && profile.phoneVerified === true && !!profile.name.trim() && !!profile.phone.trim()
}
