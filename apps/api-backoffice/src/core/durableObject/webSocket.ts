import {
    WebSocketBrokerBase,
    WebSocketServerBase,
} from '@loanms/websocket/server'

import { backofficeRealtimeRegistry } from '../../services/realtime/configuration.js'

type TBackofficeWebSocketEnvironment = {
    LOANMSBOFC_DO_WSS: DurableObjectNamespace<WebSocketServer>
}

export class WebSocketBroker extends WebSocketBrokerBase<TBackofficeWebSocketEnvironment> {
    protected getLeafNamespace() {
        return this.env.LOANMSBOFC_DO_WSS
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
