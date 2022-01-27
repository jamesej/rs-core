import { Url } from "./Url.ts";
import { MessageBody } from "./MessageBody.ts";
import { CookieOptions } from "./CookieOptions.ts";
import { resolvePathPatternWithUrl } from "./PathPattern.ts";
import { isJson } from "./mimeType.ts";
import parseRange from "https://cdn.skypack.dev/range-parser?dts";
import { ab2str, str2ab } from "./utility/arrayBufferUtility.ts";
import { getProp } from "./utility/utility.ts";
import { ServerRequest, Response as ServerResponse } from 'std/http/server.ts';
import { IAuthUser } from "./user/IAuthUser.ts";

const sendHeaders: string[] = [
    "accept-ranges",
    "access-control-allow-origin",
    "access-control-allow-credentials",
    "access-control-expose-headers",
    "access-control-max-age",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "cache-control",
    "content-disposition",
    "content-encoding",
    "content-language",
    //"content-length", set automatically, breaks response if set
    "content-location",
    "content-md5",
    "content-range",
    "content-security-policy", // content-type is set from mime-type
    "date",
    "delta-base",
    "etag",
    "expires",
    "im",
    "last-modified",
    "link",
    "location",
    "p3p",
    "pragma",
    "proxy-authenticate",
    "public-key-pins",
    "refresh",
    "retry-after",
    "server",
    "set-cookie",
    "strict-transport-security",
    "timing-allow-origin",
    "trailer",
    "transfer-encoding",
    "tk",
    "upgrade",
    "vary",
    "via",
    "warning",
    "www-authenticate",
    "x-content-type-options",
    "x-correlation-id",
    "x-frame-options",
    "x-powered-by",
    "x-request-id",
    "x-restspace-service",
    "x-ua-compatible",
    "x-xss-protection"
];

export class Message {
    cookies: { [key: string]: string } = {};
    headers: { [key: string]: string | string[] } = {};
    context: { [key: string]: Record<string, unknown> } = {};
    depth = 0;
    conditionalMode = false; // whether the msg might be representing an error in conditional mode i.e. status 200, error in body
    authenticated = false;
    originator = '';
    internalPrivilege = false;
    url: Url;
    externalUrl: Url | null = null;
    user: IAuthUser | null = null;
    protected _status = 0;
    protected _data?: MessageBody;
    protected uninitiatedDataCopies: MessageBody[] = [];
    
    private static pullName = new RegExp(/([; ]name=["'])(.*?)(["'])/);

    get data(): MessageBody | undefined {
        return this._data;
    }
    set data(d: MessageBody | undefined) {
        this.cancelOldStream();
        this._data = d;
    }

    get status(): number {
        return this.data && this.data.statusCode > 0 ? this.data.statusCode : this._status;
    }
    set status(code: number) {
        this._status = code;
    }

    get ok(): boolean {
        return this.status < 400;
    }

    get isRedirect(): boolean {
        return 300 <= this.status && this.status < 400;
    }

    get isManageRequest(): boolean {
        const modeHdr = this.getHeader('X-Restspace-Request-Mode');
        return !!modeHdr && (modeHdr === 'manage');
    }

    get name(): string {
        const cd = this.getHeader('Content-Disposition');
        if (!cd) return '';
        const match = Message.pullName.exec(cd);
        return match && match[2] ? match[2] : '';
    }
    set name(name: string) {
        const cd = this.getHeader('Content-Disposition') as string;
        if (cd) {
            this.setHeader('Content-Disposition',
                cd.replace(Message.pullName, `$1${name}$3`));
        } else {
            this.setHeader('Content-Disposition', `form-data; name="${name}"`);
        }
    }

    get host(): string {
        const host = this.getHeader('Host');
        return host || '';
    }

    constructor(url: Url | string, public tenant: string, public method: string = "GET", headers?: Headers | { [key:string]: string | string[] }, data?: MessageBody) {
        this.url = (typeof url === 'string') ? new Url(url) : url;
        this.data = data;
        if (headers) {
            if (headers instanceof Headers) {
                for (const [key, val] of headers.entries()) this.headers[key] = val;
            } else {
                this.headers = headers;
            }
        }
        // handle forwards from reverse proxies which deal with https, we do the below
        // to get back the original request url scheme
        if (this.getHeader("x-forwarded-proto")) {
            this.url.scheme = this.getHeader("x-forwarded-proto") + '://';
        }
        const cookieStrings = ((this.headers['cookie'] as string) || '').split(';');
        this.cookies = cookieStrings ? cookieStrings.reduce((res, cookieString) => {
            const parts = cookieString.trim().split('=');
            res[parts[0]] = parts[1];
            return res;
        }, {} as { [ key: string]: string }) : {};
    }

    copy(): Message {
        const msg = new Message(this.url.copy(), this.tenant, this.method, { ...this.headers }, this.data);
        msg.externalUrl = this.externalUrl ? this.externalUrl.copy() : null;
        msg.depth = this.depth;
        msg.conditionalMode = this.conditionalMode;
        msg.authenticated = this.authenticated;
        msg.internalPrivilege = this.internalPrivilege;
        msg.user = this.user;
        return msg.setStatus(this.status);
    }

    /** copies the messge's data, teeing it if it is a stream */
    copyWithData(): Message {
        const newMsg = this.copy();
        newMsg.data = this.data ? this.data.copy() : undefined;
        if (newMsg.data) this.uninitiatedDataCopies.push(newMsg.data);
        return newMsg;
    }

    hasData(): boolean {
        return !!this.data && !!this.data.data;
    }

    headerCase(header: string): string {
        return header.split('-').map(part => part.substr(0, 1).toUpperCase() + part.substr(1).toLowerCase()).join('-');
    }

    private setHeaders(headers: Headers) {
        Object.entries(this.headers)
            .flatMap(([k, vs]) => Array.isArray(vs) ? vs.map(v => [k, v]) : [[k, vs]]) // expand multiple identical headers
            .filter(([k, v]) => sendHeaders.indexOf(k.toLowerCase()) >= 0
                && (k.toLowerCase() !== 'content-disposition' || !v.startsWith('form-data')))
            .forEach(([k, v]) => headers.set(this.headerCase(k), v));
        return headers;
    }

    toResponse() {
        const res = new Response(this.data?.data || undefined,
            {
                status: this.status || 200
            });
        this.setHeaders(res.headers);
        if (this.data) {
            res.headers.set('content-type', this.data.mimeType || 'text/plain');
            //if (this.data.size) res.setHeader('Content-Length', this.data.size.toString());
        } else {
            res.headers.set('content-type', 'text/plain');
        }
        res.headers.set('X-Powered-By', 'Restspace');
        return res;
    }
    toServerResponse() {
        const res: ServerResponse = {
            status: this.status || 200,
            headers: this.setHeaders(new Headers()),
            body: this.data ? this.data.asServerResponseBody() : undefined
        }
        return res;
    }

    setStatus(status: number, message?: string): Message {
        if (message !== undefined) {
            this.setData(message, 'text/plain');
        }
        this.status = status;
        return this;
    }

    getHeader(header: string): string {
        const hdr = this.headers[header.toLowerCase()];
        return Array.isArray(hdr) ? hdr[0] : hdr;
    }

    setHeader(header: string, value: string) {
        this.headers[header.toLowerCase()] = value; 
        return this;
    }

    removeHeader(header: string) {
        delete this.headers[header.toLowerCase()];
    }

    setServiceRedirect(servicePath: string) {
        this.setHeader('X-Restspace-Service-Redirect', servicePath);
    }
    getServiceRedirect() {
        const redir = this.getHeader('X-Restspace-Service-Redirect')
        return redir;
    }
    applyServiceRedirect() {
        const redirServicePath = this.getServiceRedirect();
        if (redirServicePath) this.url.servicePath = redirServicePath;
    }

    getRequestRange(size: number) {
        const ranges = this.getHeader('Range');
        if (!ranges) return null;
        const parsed = parseRange(size, ranges, { combine: true });
        return parsed;
    }

    setRange(type: string, size: number, range?: { start: number, end: number }) {
        this.setHeader('Content-Range', type + ' ' + (range ? range.start + '-' + range.end : '*') + '/' + size);
        if (range && this.data) this.data.size = range.end - range.start + 1;
        return this;
    }

    getCookie(name: string): string | undefined {
        return this.cookies[name] === undefined ? undefined : decodeURIComponent(this.cookies[name]);
    }

    setCookie(name: string, value: string, options: CookieOptions) {
        let currSetCookie: string[] = this.headers['set-cookie'] as string[] || [];
        currSetCookie = currSetCookie.filter((sc) => !sc.startsWith(name + '='));
        this.headers['set-cookie'] = [ ...currSetCookie, `${name}=${encodeURIComponent(value)}${options}` ];
        return this;
    }

    deleteCookie(name: string) {
        this.setCookie(name, '', new CookieOptions({ expires: new Date(2000, 0, 1) }));
    }

    private cancelOldStream() {
        if (this.data?.data instanceof ReadableStream) {
            this.data.data.cancel('message body change'); // fire&forget promise
        }
    }

    setData(data: string | ArrayBuffer | ReadableStream | null, mimeType: string) {
        this.cancelOldStream();
        if (data == null) {
            this.data = undefined;
        } else if (typeof data === 'string') {
            this.data = new MessageBody(str2ab(data), mimeType);
        } else {
            this.data = new MessageBody(data, mimeType);
        }
        this._status = 0;
        this.conditionalMode = false;
        return this;
    }

    setText(data: string) {
        this.cancelOldStream();
        this.data = new MessageBody(str2ab(data), 'text/plain');
        this._status = 0;
        this.conditionalMode = false;
        return this;
    }

    setDataJson(value: any) {
        this._status = 0;
        this.conditionalMode = false;
        return this.setData(JSON.stringify(value), 'application/json');
    }

    setDirectoryJson(value: any) {
        this.setDataJson(value);
        this.data?.setMimeType('inode/directory+json');
        return this;
    }

    setMethod(httpMethod: string) {
        this.method = httpMethod;
        return this;
    }

    setUrl(url: Url | string) {
        if (typeof url === 'string') {
            this.url = Url.inheritingBase(this.url, url);
        } else {
            this.url = url;
        }
        return this;
    }

    setName(name: string) {
        this.name = name;
        return this;
    }

    setDateModified(dateModified: Date) {
        if (this.data) this.data.dateModified = dateModified;
        return this;
    }

    enterConditionalMode() {
        if (!this.ok) {
            const errorMsg = this.data && (this.data.data instanceof ArrayBuffer) ? ab2str(this.data.data) : '';
            this.conditionalMode = true;
            this.setDataJson({ _errorStatus: this.status, _errorMessage: errorMsg }).setStatus(200);
        }
        return this;
    }

    exitConditionalMode() {
        if (this?.data?.mimeType === 'application/json' && this?.data.data instanceof ArrayBuffer) {
            const str = ab2str(this.data.data);
            const err = str ? JSON.parse(str) : {};
            if (err && err['_errorStatus'] !== undefined && err['_errorMessage'] !== undefined) {
                this.setStatus(err['_errorStatus'] as number, err['_errorMessage'] as string);
            }
        }
        return this;
    }

    callDown() {
        this.depth++;
        return this;
    }

    callUp() {
        this.depth--;
        return this;
    }

    async requestExternal(): Promise<Message> {
        let resp: Response;

        const headers = new Headers();
        for (const [key, val] of Object.entries(this.headers)) {
            if (Array.isArray(val)) {
                val.forEach(v => headers.set(key, v));
            } else {
                headers.set(key, val);
            }
        }
        headers.set('content-type', this.data?.mimeType || 'text/plain');
        if (this.data?.size) {
            headers.set('content-length', this.data.size.toString());
        }

        try {
            const body = this.method !== 'GET' ? this.data?.data : null;
            resp = await fetch(this.url.toString(), {
                method: this.method,
                headers,
                body
            });
        } catch (err) {
            console.error(`Request failed: ${err}`);
            return this.setStatus(500, 'request fail');
        }
        const msgOut = Message.fromResponse(resp, this.tenant);
        msgOut.method = this.method; // slightly pointless
        return msgOut;
    }

    async divertToSpec(spec: string | string[], defaultMethod?: string, effectiveUrl?: Url, inheritMethod?: string, headers?: object): Promise<Message | Message[]> {
        if (Array.isArray(spec)) {
            const unflatMsgs = await Promise.all(spec.flatMap(stg => this.divertToSpec(stg, defaultMethod, effectiveUrl, inheritMethod, headers)));
            return unflatMsgs.flat(1) as Message[];
        }
        let obj = {};
        const hasData = (mimeType: string) => isJson(mimeType) || mimeType === 'application/x-www-form-urlencoded';
        // include object if there's data, it's json and it includes an object macro
        if (this.data && this.data.mimeType && hasData(this.data.mimeType) && spec.indexOf('${') >= 0) {
            obj = await this.data.asJson();
        }
        const msgs = Message.fromSpec(spec, this.tenant, effectiveUrl || this.url, obj, defaultMethod, this.name, inheritMethod, headers);
        // TODO ensure data splitting works with streams
        (Array.isArray(msgs) ? msgs : [ msgs ]).forEach(msg => {
            msg.data = msg.data || this.data;
            msg.headers = { ...this.headers };
            msg.setStatus(this.status);
            msg.internalPrivilege = this.internalPrivilege;
            msg.depth = this.depth;
            msg.authenticated = this.authenticated;
            msg.user = this.user;
        });
        return msgs;
    }

    redirect(url: Url, isTemporary?: boolean) {
        this.setStatus(isTemporary ? 302 : 301);
        this.setHeader('Location', url.toString());
        return this;
    }

    toString() {
        return `${this.method} ${this.url.toString()} ${this.status} ${this.hasData() ? this.data!.mimeType : "no data"}`;
    }

    static fromServerRequest(req: ServerRequest, tenant: string) {
        const url = new Url(req.url);
        return new Message(url, tenant, req.method, req.headers, MessageBody.fromServerRequest(req) || undefined);
    }

    static fromRequest(req: Request, tenant: string) {
        const url = new Url(req.url);
        return new Message(url, tenant, req.method, req.headers, MessageBody.fromRequest(req) || undefined);
    }
 
    static fromResponse(resp: Response, tenant: string) {
        const msg = new Message(resp.url, tenant, "", resp.headers,
            resp.body
                ? new MessageBody(resp.body, resp.headers.get('content-type') || 'text/plain')
                : undefined);
        msg.setStatus(resp.status);
        return msg;
    }

    private static isUrl(url: string) {
        return Url.urlRegex.test(url) || (url.startsWith('$') && !url.startsWith('$this'));
    }

    private static isMethod(method: string) {
        return [ "GET", "POST", "PUT", "OPTIONS", "HEAD", "PATCH", "$METHOD" ].includes(method);
    }


    /** A request spec is "[<method>] [<post data property>] <url>" */
    static fromSpec(spec: string, tenant: string, referenceUrl?: Url, data?: any, defaultMethod?: string, name?: string, inheritMethod?: string, headers?: object) {
        const parts = spec.trim().split(' ');
        let method = defaultMethod || 'GET';
        let url = '';
        let postData: any = null;
        if (Message.isUrl(parts[0]) && !Message.isMethod(parts[0])) {
            url = spec;
        } else if (parts.length > 1 && Message.isUrl(parts[1]) && Message.isMethod(parts[0])) {
            // $METHOD indicates use the method inherited from an outer message
            method = parts[0] === '$METHOD' ? (inheritMethod || method) : parts[0];
            url = parts.slice(1).join(' ');
        } else if (parts.length > 2 && Message.isUrl(parts[2]) && Message.isMethod(parts[0]) && data) {
            method = parts[0] === '$METHOD' ? (inheritMethod || method) : parts[0];
            const propertyPath = parts[1];
            if (propertyPath === '$this') {
                postData = data;
            } else {
                postData = getProp(data, propertyPath);
            }
            url = parts.slice(2).join(' ');
        } else {
            console.error('bad req spec: ' + spec);
            throw new Error('Bad request spec');
        }
        if (referenceUrl || data) {
            const refUrl = referenceUrl || new Url('/');
            const urls = resolvePathPatternWithUrl(url, refUrl, data, name);
            if (Array.isArray(urls)) {
                return urls.map((url) => new Message(Url.inheritingBase(referenceUrl, url), tenant, method, { ...headers }, postData ? MessageBody.fromObject(postData) : undefined));
            }
            url = urls;
        }
        return new Message(Url.inheritingBase(referenceUrl, url), tenant, method, { ...headers }, postData ? MessageBody.fromObject(postData) : undefined);
    }
}