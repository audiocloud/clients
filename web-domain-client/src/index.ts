

export class WebDomainClient {
    constructor(
        private readonly api_key: string,
        private readonly default_app_id: string,
        private readonly domain_public_url: string,

        private web_socket_state: string = 'closed',
        private current_request: string = '',
        private timeout_error: string = ''
    ) {}

    get default_headers() {
        return {
            "X-Api-Key": this.api_key,
            "Content-Type": "application/json"
        }
    }

    // setters

    // class methods
    // - open WebSocket connection

    async connectWS() {

        const url = `wss${this.domain_public_url.split('https')[1]}/ws`
        
        const socket = new WebSocket(url)

        // binary frames
        // npm msgpack

        // min 1 session packet na sekundo

        // security eventually

        socket.addEventListener('open', (event) => {
            console.log(`[Client] Connected...`)
            console.log(event)
            this.web_socket_state = 'open'
        })

        socket.addEventListener('message', (data) => {
            console.log(`[Client] Message received: ${data}`)

            // something like this:
            // msgpack.unpack(data)
        })

        socket.addEventListener('error', (error) => {
            console.log(error)
            this.web_socket_state = 'error'
        })

        socket.addEventListener('close', () => {
            console.log(`[Client] Connection closed.`)
            this.web_socket_state = 'closed'
        })
    }
}