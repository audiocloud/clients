import ReconnectingWebSocket from 'reconnecting-websocket';
import {pack, unpack} from 'msgpackr';
import {DomainClientMessage, DomainServerMessage} from "@audiocloud/domain-client";

export class WebDomainClient {
    private readonly web_socket_url: string;
    private readonly response_queue: Array<DomainClientMessage> = []
    private web_socket: ReconnectingWebSocket

    constructor(private readonly api_url: string) {
        this.web_socket_url = api_url.replace(/http/, 'ws') + '/ws'
        console.log(this.web_socket_url)
        this.web_socket = new ReconnectingWebSocket(this.web_socket_url);
        this.web_socket.binaryType = 'arraybuffer'
        this.web_socket.onopen = this.on_open.bind(this)
        this.web_socket.onclose = this.on_close.bind(this)
        this.web_socket.onmessage = this.on_raw_message.bind(this)
    }

    get connected() {
        return this.web_socket.readyState == ReconnectingWebSocket.OPEN
    }

    private on_open() {
        console.log('[web_socket]: open')
        this.flush_responses()
    }

    private flush_responses() {
        if (this.connected) {
            while (this.response_queue.length > 0) {
                this.web_socket.send(pack(this.response_queue.shift()))
            }
        }
    }

    private on_close() {
        console.log('[web_socket]: close')
    }

    private on_raw_message(data: MessageEvent) {
        let message: DomainServerMessage
        if (data.data instanceof ArrayBuffer) {
            message = unpack(new Uint8Array(data.data))
        } else {
            message = JSON.parse(data.data)
        }
        this.on_message(message)
    }

    private on_message(message: DomainServerMessage) {
        if ('ping' in message) {
            console.log('PING', message.ping.challenge)
            this.respond({
                pong: {challenge: message.ping.challenge, response: 'pongity pong pong'}
            })
        }
    }

    private respond(message: DomainClientMessage) {
        this.response_queue.push(message)
        this.flush_responses()
    }
}

const client = new WebDomainClient('http://localhost:7200');
