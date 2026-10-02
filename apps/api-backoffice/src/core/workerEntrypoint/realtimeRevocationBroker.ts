import type { TRealtimeRevocationDirective } from '@hyperion/websocket/transport'
import { WorkerEntrypoint } from 'cloudflare:workers'

import { deliverBackofficeRealtimeRevocationLocally } from '../../services/realtime/authorization.js'
import type { THonoBindings } from '../../types.js'

export class RealtimeRevocationBroker extends WorkerEntrypoint<THonoBindings> {
    deliverRealtimeRevocation(rawInput: TRealtimeRevocationDirective) {
        return deliverBackofficeRealtimeRevocationLocally(
            this.env.HYPERIONBOFC_DO_WSB,
            rawInput,
        )
    }
}
