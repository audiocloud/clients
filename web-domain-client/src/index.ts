import Notepack from "notepack.io"
import { nanoid } from "nanoid"
import ReconnectingWebSocket from "reconnecting-websocket"
import {
  AppMediaObjectId,
  AppTaskId,
  DesiredTaskPlayState,
  DomainError,
  FixedInstanceNodeId,
  MixerNodeId,
  ModifyTaskSpec,
  PlayBitDepth,
  Result,
  SampleRate,
  SecureKey,
  SocketId,
  SocketMessage,
  SocketRequestMessage,
  TaskEvent,
  TimeSegment,
} from "@audiocloud/domain-client"

import { ClientError, err_busy, err_not_connected, err_timed_out } from "./error"
import { PeerConnection } from "./peer"
import { error, ok, response_type } from "./response"
import { Mutex } from "async-mutex"

interface Request {
  resolve: (value: Result<any, any>) => void
}

export class RTFixedInstanceClient<Params> {
  params: Params

  constructor(private readonly task_client: RTTaskClient, public node_id: FixedInstanceNodeId, init_params: Params) {
    this.params = init_params
  }

  set_parameters(params: Partial<Params>) {
    const diff = {}
    for (const param_name in params) {
      if (params[param_name] !== this.params[param_name]) {
        ;(diff as any)[param_name] = (this.params as any)[param_name] = params[param_name]
      }
    }

    let is_empty = true
    for (const key in diff) {
      is_empty = false
      break
    }

    if (!is_empty) {
      this.task_client.set_fixed_parameters(this.node_id, diff)
    }
  }
}

export class RTTaskClient {
  private mutex = new Mutex()
  private change_queue: Array<ModifyTaskSpec> = []

  constructor(
    readonly task_id: AppTaskId,
    public version: number,
    readonly secure_key: SecureKey,
    private readonly domain_client: RTDomainClient
  ) {}

  private async flush() {
    const unlock = await this.mutex.acquire()
    try {
      if (this.change_queue.length) {
        const { change_queue } = this
        this.change_queue = []
        await this.domain_client.modify_task_spec(this.task_id, this.version, change_queue)
      }
    } finally {
      unlock()
    }
  }

  async play(
    mixer_id: MixerNodeId,
    segment: TimeSegment,
    looping: boolean,
    start_at: number,
    sample_rate: SampleRate,
    bit_depth: PlayBitDepth
  ) {
    await this.flush()
    const play_id = nanoid()
    const unlock = await this.mutex.acquire()
    try {
      const result = await this.domain_client.set_desired_play_state(this.task_id, this.version, {
        play: {
          play_id,
          start_at,
          sample_rate,
          segment,
          bit_depth,
          looping,
          mixer_id,
        },
      })

      if (result.is_ok) {
        this.version = result.ok
      }

      return result
    } finally {
      unlock()
    }
  }

  async render(mixer_id: MixerNodeId, segment: TimeSegment, object_id: AppMediaObjectId) {
    await this.flush()
    const unlock = await this.mutex.acquire()
    try {
      const result = await this.domain_client.set_desired_play_state(this.task_id, this.version, {
        render: {
          render_id: nanoid(),
          mixer_id,
          object_id,
          segment,
        },
      })
    } finally {
      unlock()
    }
  }

  async stop() {
    await this.flush()
    const unlock = await this.mutex.acquire()
    try {
      const result = await this.domain_client.set_desired_play_state(this.task_id, this.version, "stopped")
      if (result.is_ok) {
        this.version = result.ok
      }
      return result
    } finally {
      unlock()
    }
  }

  set_fixed_parameters(fixed_id: FixedInstanceNodeId, values: any) {
    for (const change of this.change_queue) {
      if (change.type === "set_fixed_instance_parameter_values" && change.fixed_id === fixed_id) {
        for (const key in values) {
          change.values[key] = values[key]
        }
        return
      }
    }

    this.change_queue.push({
      type: "set_fixed_instance_parameter_values",
      fixed_id,
      values,
    })
  }
}

/**
 * Client for connecting to a domain via web sockets and WebRTC
 */
export class RTDomainClient {
  private readonly web_socket_url: string
  private web_socket: ReconnectingWebSocket
  private peer_connections = new Map<string, PeerConnection>()
  private pending_responses = new Map<string, Request>()
  private connected = false
  private tasks: Map<AppTaskId, RTTaskClient> = new Map()

  constructor(private readonly base_url: string, private readonly events: RTDomainClientEvents) {
    this.web_socket_url = base_url.replace(/^http/, "ws")
    this.web_socket = new ReconnectingWebSocket(this.web_socket_url)
    this.web_socket.onopen = () => this.check_connected()
    this.web_socket.onclose = () => this.check_connected()
    this.web_socket.onmessage = (event) => this.on_message(null, event.data)
  }

  private check_connected() {
    let new_connected = this.web_socket.readyState === WebSocket.OPEN
    for (const peer of this.peer_connections.values()) {
      if (peer.connected) {
        new_connected = true
      }
    }

    if (!this.connected && new_connected) {
      this.connected = true
      this.events.on_connected()
    } else if (this.connected && !new_connected) {
      this.connected = false
      this.events.on_disconnected()
    }
  }

  protected request<T, E>(req: SocketRequestMessage, timeout_ms = 5000): Promise<Result<T, E | ClientError>> {
    if (!this.connected) {
      return Promise.resolve(err_not_connected())
    }

    const request_id = nanoid()
    const promise = new Promise<Result<T, E | ClientError>>((resolve_request) => {
      const response_key = `${response_type(req.type)}.${request_id}`
      this.pending_responses.set(response_key, {
        resolve: (value) => {
          if (this.pending_responses.has(response_key)) {
            this.pending_responses.delete(response_key)
            resolve_request(value)
          }
        },
      })

      setTimeout(() => {
        if (this.pending_responses.has(response_key)) {
          this.pending_responses.delete(response_key)
          resolve_request(err_timed_out(request_id))
        }
      }, timeout_ms)
    })

    let encoded = Notepack.encode(req)

    for (const peer of this.peer_connections.values()) {
      if (peer.connected) {
        peer.send_data(encoded)
        return promise
      }
    }

    this.web_socket.send(encoded)
    return promise
  }

  private readonly on_message = (socket_id: SocketId | null, data: ArrayBuffer) => {
    const received: SocketMessage = Notepack.decode(data)
    switch (received.type) {
      case "task_event": {
        this.events.on_task_event(received.task_id, received.event)
        break
      }
      case "submit_peer_connection_candidate": {
        const peer = this.peer_connections.get(received.socket_id)
        if (peer) {
          peer.add_ice_candidate(received.candidate).catch((error) =>
            this.events.on_client_error({
              type: "ice_candidate",
              error,
            })
          )
        } else {
          console.warn("received ICE candidate for unknown socket", received.socket_id)
        }
        break
      }
      default: {
        const key = `${received.type}.${received.request_id}`
        const request = this.pending_responses.get(key)
        if (request) {
          if ("ok" in received.result) {
            request.resolve(ok(received.result.ok))
          } else {
            request.resolve(error(received.result.error))
          }
        } else {
          console.warn("received result for unknown request", key, received.result)
        }

        break
      }
    }
  }

  /**
   * Attach the current active socket to a task
   *
   * @param task_id the task to attach to
   * @param secure_key secure key
   *
   * @returns null on success or error
   */
  attach_to_task(task_id: AppTaskId, secure_key: SecureKey): ServicePromise {
    return this.request({
      type: "request_attach_to_task",
      task_id,
      secure_key,
      request_id: nanoid(),
    })
  }

  /**
   * Detach the current active socket from a task
   *
   * @param task_id the task to detach from
   *
   * @returns null on success or error
   */
  detach_from_task(task_id: AppTaskId): ServicePromise {
    return this.request({ type: "request_detach_from_task", task_id, request_id: nanoid() })
  }

  /**
   * Set a desired play state for the task
   *
   * @param task_id the task we are modifying
   * @param version version of the task, if it's outdated, the call will fail
   * @param desired the desired state
   *
   * @returns new version number on success or error
   */
  set_desired_play_state(task_id: AppTaskId, version: number, desired: DesiredTaskPlayState): ServicePromise<number> {
    return this.request({
      type: "request_set_desired_play_state",
      task_id,
      desired,
      version,
      request_id: nanoid(),
    })
  }

  /**
   * Modify the task specification
   *
   * @param task_id the task to modify
   * @param version version of the task, if it's outdated, the call will fail
   * @param modification list of modifications to apply
   *
   * @returns new version number on success or error
   */
  modify_task_spec(task_id: AppTaskId, version: number, modification: ModifyTaskSpec[]): ServicePromise<number> {
    return this.request({ type: "request_modify_task_spec", task_id, version, modification, request_id: nanoid() })
  }
}

type ServicePromise<T = null> = Promise<Result<T, DomainError | ClientError>>

export interface RTDomainClientEvents {
  on_connected(): void

  on_disconnected(): void

  on_client_error(kind: ClientError): void

  on_task_event(task_id: AppTaskId, event: TaskEvent): void
}
