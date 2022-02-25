import { IAdapter } from "./adapter/IAdapter.ts";
import { IServiceConfig } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { longestMatchingPath, PathMap } from "./PathMap.ts";
import { Url } from "./Url.ts";
import Ajv, { Schema } from "https://cdn.skypack.dev/ajv?dts";
import { getErrors } from "./utility/errors.ts";
import { ServiceContext } from "./ServiceContext.ts";

export type ServiceFunction<TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> =
    (msg: Message, context: ServiceContext<TAdapter>, config: TConfig) => Promise<Message>;

export enum AuthorizationType {
    none, read, write, create
}

const ajv = new Ajv({ allErrors: true, strictSchema: false, allowUnionTypes: true });

export class Service<TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> {
    static Identity = (new Service()).setMethodPath("all", "/", msg => Promise.resolve(msg));
    
    methodFuncs: { [ method: string ]: PathMap<ServiceFunction<TAdapter, TConfig>> } = {};
    schemas: { [ method: string ]: PathMap<Schema> } = {};

    funcByUrl(method: string, url: Url) : [ string[], ServiceFunction<TAdapter, TConfig> ] | undefined {
        const pathMap = this.methodFuncs[method];
        if (!pathMap) return undefined;
        const matchPath = longestMatchingPath(pathMap, url.servicePath);
        if (!matchPath) return undefined;
        const matchPathElements = matchPath.split('/').filter(el => !!el);
        return [ matchPathElements, pathMap[matchPath] ];
    }

    func: ServiceFunction<TAdapter, TConfig> = (msg: Message, context: ServiceContext<TAdapter>, config: TConfig) => {
        const method = msg.method.toLowerCase();
        const callMethodFunc = ([ matchPathElements, methodFunc ]: [ string[], ServiceFunction<TAdapter, TConfig> ],
            msg: Message, context: ServiceContext<TAdapter>, config: TConfig) => {
            msg.url.basePathElements = msg.url.basePathElements.concat(matchPathElements);
            return methodFunc(msg, context, config);
        }

        if (method === 'options') return Promise.resolve(msg);
        if (msg.url.isDirectory) {
            const pathFunc = this.funcByUrl(method + 'Directory', msg.url);
            if (pathFunc) {
                return callMethodFunc(pathFunc, msg, context, config);
            }
        }
        let pathFunc = this.funcByUrl(method, msg.url);
        if (pathFunc) return callMethodFunc(pathFunc, msg, context, config);
        // default put is post with no returned body
        if (method === 'put' && this.methodFuncs['post'] && !context.manifest.isFilter) {
            pathFunc = this.funcByUrl('post', msg.url);
            if (!pathFunc) return Promise.resolve(msg.setStatus(404, 'Not found'));
            return callMethodFunc(pathFunc, msg, context, config).then(msg => {
                if (msg.data) msg.data = undefined;
                return msg;
            });
        }
        if (method === 'head') {
            pathFunc = this.funcByUrl('get', msg.url) || this.funcByUrl('all', msg.url);
            if (pathFunc) {
                return callMethodFunc(pathFunc, msg, context, config).then(msg => {
                    if (msg.data) msg.data = undefined;
                    return msg;
                });
            } else {
                return Promise.resolve(msg.setStatus(404, 'Not found'));
            }
        }
        if (this.methodFuncs['all']) {
            pathFunc = this.funcByUrl('all', msg.url);
            if (!pathFunc) return Promise.resolve(msg.setStatus(404, 'Not found'));
            return callMethodFunc(pathFunc, msg, context, config);
        }
        return Promise.resolve(context.manifest.isFilter
            ? msg
            : msg.setStatus(404, 'Not found')
        );
    }

    authType: (msg: Message) => Promise<AuthorizationType> = (msg: Message) => { // returns promise as overrides may need to be async
        switch (msg.method) {
            case "OPTIONS": return Promise.resolve(AuthorizationType.none);
            case "GET": case "HEAD": case "POST": return Promise.resolve(AuthorizationType.read);
            default: return Promise.resolve(AuthorizationType.write);
        }
    }

    setMethodPath(method: string, path: string, func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) {
        if (!path.startsWith('/')) path = '/' + path;
        if (schema) {  
            const validator = ajv.compile(schema);
            const innerFunc = func;
            func = (msg, context, config) => {
                if (!msg.validate(validator)) {
                    return Promise.resolve(msg.setStatus(400, getErrors(validator)));
                } else {
                    return innerFunc(msg, context, config);
                }
            };
            if (this.schemas[method]) {
                this.schemas[method][path] = schema;
            } else {
                this.schemas[method] = { [path]: schema };
            }
        }
        if (this.methodFuncs[method]) {
            this.methodFuncs[method][path] = func;
        } else {
            this.methodFuncs[method] = { [path]: func };
        }
        return this;
    }

    get = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('get', '/', func);

    getPath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('get', path, func);

    getDirectory = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('getDirectory', '/', func);
    
    post = (func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) => this.setMethodPath('post', '/', func, schema);

    postPath = (path: string, func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) => this.setMethodPath('post', path, func, schema);
    
    postDirectory = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('postDirectory', '/', func);

    put = (func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) => this.setMethodPath('put', '/', func, schema);

    putPath = (path: string, func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) => this.setMethodPath('put', path, func, schema);

    putDirectory = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('putDirectory', '/', func);

    delete = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('delete', '/', func);

    deletePath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('delete', path, func);

    deleteDirectory = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('deleteDirectory', '/', func);

    all = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('all', '/', func);

    allPath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('all', path, func);
}

export class AuthService<TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> extends Service<TAdapter, TConfig> {
    setUser = (func: ServiceFunction<TAdapter, TConfig>) => {
        this.setUserFunc = func;
    }

    setUserFunc: ServiceFunction<TAdapter, TConfig> = (msg: Message) => Promise.resolve(msg);
}

export type MessageFunction = (msg: Message) => Promise<Message>;