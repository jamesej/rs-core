import { slashTrim, pathCombine, decodeURIComponentAndPlus, last, arrayEqual } from "./utility/utility.ts";
import { resolvePathPatternWithUrl } from "./PathPattern.ts";

export type QueryStringArgs = { [ key: string]: string | null };

/** Internal url class, note it does not accept relative urls (except site relative) as there is no context
 * for them
 */
export class Url {
    scheme: string = '';
    domain: string = '';
    fragment: string = '';

    get path(): string {
        return '/' + this.pathElements.join('/') + (this.isDirectory && this.pathElements.length > 0 ? '/' : '');
    }
    set path(val: string) {
        this.pathElements = slashTrim(val).split('/').filter(el => !!el);
        this._isDirectory = val.endsWith('/') || val === '';
    }
    pathElements: string[] = [];

    private _isDirectory = false;
    get isDirectory(): boolean {
        return this._isDirectory;
    }

    get resourceName(): string {
        return this._isDirectory ? '' : last(this.pathElements);
    }
    set resourceName(val: string) {
        let resName = val;
        const wasDirectory = this._isDirectory;
        if (val.endsWith('/')) {
            this._isDirectory = true;
            resName = val.slice(0, -1);
        } else {
            this._isDirectory = false;
        }
        if (wasDirectory) {
            this.pathElements.push(val);
        } else {
            this.pathElements[this.pathElements.length - 1] = resName;
        }
    }

    get resourceParts(): string[] {
        return this.resourceName.split('.');
    }

    get resourceExtension(): string {
        return (this.resourceParts.length > 1) ? last(this.resourceParts) : '';
    }

    queryString: string = '';
    get query(): QueryStringArgs {
        return this.queryString.split('&').filter(part => !!part).reduce((res, queryPart) => {
            const keyValue = queryPart.split('=');
            res[keyValue[0]] = keyValue.length > 1 ? decodeURIComponentAndPlus(keyValue[1]) : null;
            return res;
        }, {} as QueryStringArgs);
    }
    set query(qry: QueryStringArgs) {
        this.queryString = Object.entries(qry).map(([key, val]) =>
                val === null ? key : `${key}=${encodeURIComponent(val)}`
            ).join('&');
    }

    basePathElementCount = 0;
    get basePathElements(): string[] {
        return this.pathElements.slice(0, this.basePathElementCount);
    }
    set basePathElements(els: string[]) {
        if (els.length <= this.pathElements.length && arrayEqual(els, this.pathElements.slice(0, els.length)))
            this.basePathElementCount = els.length;
        else
            this.basePathElementCount = 0;
    }

    get servicePath(): string {
        return this.servicePathElements.join('/') + (this.isDirectory ? '/' : '');
    }
    set servicePath(path: string) {
        this.pathElements = [ ...this.basePathElements, ...slashTrim(path).split('/') ];
        this._isDirectory = path.endsWith('/') || (this.pathElements.length === 0 && path === '');
    }

    get adapterPath(): string {
        return this.servicePath + ( this.queryString ? '?' + this.queryString : '' );
    }

    get servicePathElements(): string[] {
        return this.pathElements.slice(this.basePathElementCount);
    }

    subPathElementCount = 0;
    get subPathElements(): string[] {
        return this.pathElements.slice(-this.subPathElementCount);
    }
    set subPathElements(els: string[]) {
        if (els.length <= this.pathElements.length && arrayEqual(els, this.pathElements.slice(-els.length)))
            this.subPathElementCount = els.length;
        else
            this.subPathElementCount = 0;
    }

    get mainPathElementCount() {
        return this.pathElements.length - this.basePathElementCount - this.subPathElementCount;
    }
    set mainPathElementCount(count: number) {
        this.subPathElementCount = this.pathElements.length - this.basePathElementCount - count;
    }

    constructor(urlString?: string) {
        if (!urlString) return;

        const urlParse = urlString.match(Url.urlRegex);
        if (!urlParse) throw new Error('bad url');

        this.scheme = urlParse[3];
        this.domain = urlParse[4];
        this.path = urlParse[5];
        this._isDirectory = this.path.endsWith('/');
        this.queryString = urlParse[6];
        this.queryString = this.queryString ? this.queryString.substr(1) : '';
        this.fragment = urlParse[7];
        this.fragment = this.fragment ? this.fragment.substr(1) : '';
    }

    hasBase(base: string) {
        return this.path.startsWith(base === '/' ? base : base + '/') || this.path === base;
    }

    copy() {
        const newUrl = new Url();
        newUrl.scheme = this.scheme;
        newUrl.domain = this.domain;
        newUrl.path = this.path;
        newUrl.queryString = this.queryString;
        newUrl.basePathElementCount = this.basePathElementCount;
        newUrl.subPathElementCount = this.subPathElementCount;

        return newUrl;
    }

    toString() {
        return `${this.scheme || ''}${this.domain || ''}${this.path}${this.queryString ? '?' + this.queryString : ''}${this.fragment ? '#' + this.fragment : ''}`;
    }

    static urlRegex = /^(((https?:\/\/)([^?#\/]+))|\/)([^?#]*)(\?[^#]*)?(#.*)?$/;

    static fromPath(path: string): Url {
        return new Url(pathCombine('/', path));
    }

    static fromPathPattern(pathPattern: string, url: Url, obj?: object) {
        return new Url(resolvePathPatternWithUrl(pathPattern, url, obj) as string);
    }
}