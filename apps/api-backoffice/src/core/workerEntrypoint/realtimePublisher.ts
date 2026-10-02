import type { TRealtimePublicationDescriptor } from '@hyperion/websocket/publisher'
import { WorkerEntrypoint } from 'cloudflare:workers'

import { publishBackofficeRealtimeLocally } from '../../services/realtime/publication.js'
import type { THonoBindings } from '../../types.js'

export class RealtimePublisher extends WorkerEntrypoint<THonoBindings> {
    publishRealtimePublication(rawInput: TRealtimePublicationDescriptor) {
        return publishBackofficeRealtimeLocally({
            descriptor: rawInput,
            namespace: this.env.HYPERIONBOFC_DO_WSB,
            origin: 'peer',
        })
    }
}
