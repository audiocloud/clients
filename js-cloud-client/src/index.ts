import {SecureKey, SessionSecurity} from "@audiocloud/api";

// not cool, we want to get all the types from the main import, move stuff from "apps" into main export
import {CreateSession, SessionSpec} from "@audiocloud/api/dist/types/cloud/apps";

// not cool as well
import {ModifySessionSpec} from "@audiocloud/api/dist/types/change";

type Success = { ok: true }

export class CloudClient {
    constructor(private readonly api_key: string,
                private readonly default_app_id: string,
                private readonly base_url = "https://api.audiocloud.io"
    ) {
    }

    get default_headers() {
        return {
            "X-Api-Key": this.api_key,
            "Content-Type": "application/json"
        }
    }

    async create_session(session_id: string, create: CreateSession & { time: { from: Date, to: Date } }, app_id?: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/sessions/${session_id}`, {
            method: "POST",
            headers: this.default_headers,
            body: JSON.stringify(create)
        }).then(res => res.json())
    }

    async replace_session_spec(session_id: string, spec: SessionSpec, app_id?: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/by-id/${session_id}/spec`, {
            method: "PUT",
            headers: this.default_headers,
            body: JSON.stringify(spec)
        }).then(res => res.json())
    }

    async replace_session_security(session_id: string, security: Record<SecureKey, SessionSecurity>, app_id?: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/by-id/${session_id}/security`, {
            method: "PUT",
            headers: this.default_headers,
            body: JSON.stringify(security)
        }).then(res => res.json())
    }

    async modify_session(session_id: string, modify: Array<ModifySessionSpec>, app_id?: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/by-id/${session_id}/modify`, {
            method: "POST",
            headers: this.default_headers,
            body: JSON.stringify(modify)
        }).then(res => res.json())
    }

    async delete_session(app_id: string, session_id: string): Promise<Success> {
        app_id = app_id || this.default_app_id;
        return fetch(`${this.base_url}/v1/${app_id}/by-id/${session_id}`, {
            method: "DELETE",
            headers: this.default_headers
        }).then(res => res.json())
    }
}

