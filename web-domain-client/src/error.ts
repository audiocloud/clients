import { RequestId } from "@audiocloud/domain-client"
import { error } from "./response"

export type ClientError =
  | {
      type: "message_parse"
      error: Error
    }
  | {
      type: "ice_candidate"
      error: Error
    }
  | {
      type: "timeout"
      request_id: RequestId
    }
  | {
      type: "not_connected"
    }
  | {
      type: "busy"
    }

export function err_not_connected<T>() {
  return error<T, ClientError>({ type: "not_connected" })
}

export function err_timed_out<T>(request_id: RequestId) {
  return error<T, ClientError>({ type: "timeout", request_id })
}

export function err_busy<T>() {
  return error<T, ClientError>({ type: "busy" })
}
