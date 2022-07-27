import { SecureKey, SessionSecurity, CreateSession, SessionSpec, ModifySessionSpec } from "@audiocloud/api";

type Success = { ok: true }

const handle_response = async (res: Response) => {
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : null;

    // check for error response
    if (!res.ok) {
        const error = (data && data.err) || res.status;
        return Promise.reject(error);
    } else {
        return data
    }
}

export class CloudClient {
    constructor(
        private readonly api_key: string,
        private readonly default_app_id: string,
        private readonly base_url = "https://api.audiocloud.io"
    ) {}

    get default_headers() {
        return {
            "X-Api-Key": this.api_key,
            "Content-Type": "application/json"
        }
    }

    async create_session(session_id: string, create: Omit<CreateSession, "time"> & { time: { from: Date, to: Date } }, app_id?: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/sessions/${session_id}`, {
            method: "POST",
            headers: this.default_headers,
            body: JSON.stringify(create)
        }).then(handle_response)
    }

    async replace_session_spec(session_id: string, spec: SessionSpec, app_id?: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/by-id/${session_id}/spec`, {
            method: "PUT",
            headers: this.default_headers,
            body: JSON.stringify(spec)
        }).then(handle_response)
    }

    async replace_session_security(session_id: string, security: Record<SecureKey, SessionSecurity>, app_id?: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/by-id/${session_id}/security`, {
            method: "PUT",
            headers: this.default_headers,
            body: JSON.stringify(security)
        }).then(handle_response)
    }

    async modify_session(session_id: string, modify: Array<ModifySessionSpec>, app_id?: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/by-id/${session_id}/modify`, {
            method: "POST",
            headers: this.default_headers,
            body: JSON.stringify(modify)
        }).then(handle_response)
    }

    async delete_session(app_id: string, session_id: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/by-id/${session_id}`, {
            method: "DELETE",
            headers: this.default_headers
        }).then(handle_response)
    }
}