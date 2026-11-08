import type {CustomerProfile} from '../types'

// Display assistance only. The server derives its own immutable membership snapshot.
export function verifiedBookingMember(profile:CustomerProfile|null,phone:string){
  return !!profile?.phoneVerified&&profile.memberVerified&&profile.phone===phone
}
