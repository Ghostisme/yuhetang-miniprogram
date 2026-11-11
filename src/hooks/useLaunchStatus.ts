import { useSyncExternalStore } from 'react'
import { getLaunchSnapshot, watchLaunchStatus } from '../services/launch-mode'

export const useLaunchStatus = () => useSyncExternalStore(watchLaunchStatus, getLaunchSnapshot, getLaunchSnapshot)
