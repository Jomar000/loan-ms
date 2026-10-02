import {
    WebSocketBrokerBase,
    WebSocketServerBase,
} from '@hyperion/websocket/server'

import { publicRealtimeRegistry } from '../../services/realtime/configuration.js'

type TPublicWebSocketEnvironment = {
    HYPERIONPUB_DO_WSS: DurableObjectNamespace<WebSocketServer>
}

export class WebSocketBroker extends WebSocketBrokerBase<TPublicWebSocketEnvironment> {
    protected getLeafNamespace() {
        return this.env.HYPERIONPUB_DO_WSS
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
