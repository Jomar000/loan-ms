import {
    WebSocketBrokerBase,
    WebSocketServerBase,
} from '@hyperion/websocket/server'

import { backofficeRealtimeRegistry } from '../../services/realtime/configuration.js'

type TBackofficeWebSocketEnvironment = {
    HYPERIONBOFC_DO_WSS: DurableObjectNamespace<WebSocketServer>
}

export class WebSocketBroker extends WebSocketBrokerBase<TBackofficeWebSocketEnvironment> {
    protected getLeafNamespace() {
        return this.env.HYPERIONBOFC_DO_WSS
    }

    protected getRealtimeRegistry() {
        return backofficeRealtimeRegistry
    }
}

export class WebSocketServer extends WebSocketServerBase<TBackofficeWebSocketEnvironment> {
    protected getRealtimeRegistry() {
        return backofficeRealtimeRegistry
    }
}
