import { ClientError } from "./error"
import { SocketMessage } from "@audiocloud/domain-client"
import Notepack from "notepack.io"

interface PeerConnectionHelper {
  on_connected(): void

  on_disconnected(): void

  on_client_error(err: ClientError): void

  on_response_received(received: SocketMessage): void
}

export class PeerConnection {
  private connection: RTCPeerConnection
  private dataChannel: RTCDataChannel

  constructor(private helper: PeerConnectionHelper) {
    this.connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] })
    this.dataChannel = this.connection.createDataChannel("data")
    this.dataChannel.onopen = () => {
      helper.on_connected()
    }
    this.dataChannel.onclose = () => {
      helper.on_disconnected()
    }
    this.dataChannel.onmessage = (event) => {
      try {
        const received = Notepack.decode(event.data) as SocketMessage
        helper.on_response_received(received)
      } catch (error) {
        helper.on_client_error({ type: "message_parse", error: <Error>error })
      }
    }
  }

  send_data(data: ArrayBuffer) {
    this.dataChannel.send(data)
  }

  get connected() {
    return this.dataChannel.readyState === "open"
  }

  add_ice_candidate(candidate: RTCIceCandidateInit): Promise<void> {
    return this.connection.addIceCandidate(new RTCIceCandidate(candidate))
  }
}
