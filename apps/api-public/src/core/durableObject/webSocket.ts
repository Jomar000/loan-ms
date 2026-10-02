import {
    WebSocketBrokerBase,
    WebSocketServerBase,
} from '@loanms/websocket/server'

import { publicRealtimeRegistry } from '../../services/realtime/configuration.js'

type TPublicWebSocketEnvironment = {
    LOANMSPUB_DO_WSS: DurableObjectNamespace<WebSocketServer>
}

export class WebSocketBroker extends WebSocketBrokerBase<TPublicWebSocketEnvironment> {
    protected getLeafNamespace() {
        return this.env.LOANMSPUB_DO_WSS
    }

    protected getRealtimeRegistry() {
        return publicRealtimeRegistry
    }
}

export class WebSocketServer extends WebSocketServerBase<TPublicWebSocketEnvironment> {
    protected getRealtimeRegistry() {
        return publicRealtimeRegistry
    }
}
