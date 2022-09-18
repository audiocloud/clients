import { Result, SocketMessage, SocketRequestMessage } from "@audiocloud/domain-client"

export function ok<T, E>(ok: T): Result<T, E> {
  return { ok, error: null, is_error: false, is_ok: true }
}

export function error<T, E>(error: E): Result<T, E> {
  return { ok: null, error, is_error: true, is_ok: false }
}

const requestResponses: Record<SocketRequestMessage["type"], SocketMessage["type"] | null> = {
  request_attach_to_task: "attach_to_task_response",
  request_detach_from_task: "detach_from_task_response",
  request_modify_task_spec: "modify_task_spec_response",
  request_peer_connection: "peer_connection_response",
  request_set_desired_play_state: "set_desired_play_state_response",
  submit_peer_connection_candidate: null,
}

export function response_type(type: SocketRequestMessage["type"]): SocketMessage["type"] {
  const response = requestResponses[type]
  if (!response) throw new Error(`Unknown request type: ${type}`)

  return response
}
