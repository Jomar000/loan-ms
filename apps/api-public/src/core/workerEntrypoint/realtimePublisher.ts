import type { TRealtimePublicationDescriptor } from '@loanms/websocket/publisher'
import { WorkerEntrypoint } from 'cloudflare:workers'

import { publishPublicRealtimeLocally } from '../../services/realtime/publication.js'
import type { THonoBindings } from '../../types.js'

export class RealtimePublisher extends WorkerEntrypoint<THonoBindings> {
    publishRealtimePublication(rawInput: TRealtimePublicationDescriptor) {
        return publishPublicRealtimeLocally({
            descriptor: rawInput,
            namespace: this.env.LOANMSPUB_DO_WSB,
            origin: 'peer',
        })
    }
}
