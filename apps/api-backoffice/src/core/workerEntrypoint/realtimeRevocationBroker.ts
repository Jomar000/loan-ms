import type { TRealtimeRevocationDirective } from '@loanms/websocket/transport'
import { WorkerEntrypoint } from 'cloudflare:workers'

import { deliverBackofficeRealtimeRevocationLocally } from '../../services/realtime/authorization.js'
import type { THonoBindings } from '../../types.js'

export class RealtimeRevocationBroker extends WorkerEntrypoint<THonoBindings> {
    deliverRealtimeRevocation(rawInput: TRealtimeRevocationDirective) {
        return deliverBackofficeRealtimeRevocationLocally(
            this.env.LOANMSBOFC_DO_WSB,
            rawInput,
        )
    }
}
