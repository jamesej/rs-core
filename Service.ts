import { IAdapter } from "./adapter/IAdapter.ts";
import { IServiceConfig, PrePost } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { longestMatchingPath, PathMap } from "./PathMap.ts";
import { PipelineSpec } from "./PipelineSpec.ts";
import { Source } from "./Source.ts";
import { Url } from "./Url.ts";

export interface SimpleServiceContext {
    tenant: string;
    prePost?: PrePost;
    call: (msg: Message, source: Source) => Promise<Message>;
    runPipeline: (msg: Message, pipelineSpec: PipelineSpec, contextUrl?: Url, concurrencyLimit?: number) => Promise<Message>;
}

export interface ServiceContext<TAdapter extends IAdapter> extends SimpleServiceContext {
    adapter: TAdapter;
}

export type ServiceFunction<T extends IAdapter = IAdapter> = (msg: Message, context: ServiceContext<T>, config: IServiceConfig) => Promise<Message>;

export enum AuthorizationType {
    none, read, write, create
}

export class Service<TAdapter extends IAdapter = IAdapter> {
    static Identity = (new Service()).setMethodPath("all", "/", msg => Promise.resolve(msg));
    
    methodFuncs: { [ method: string ]: PathMap<ServiceFunction<TAdapter>> } = {};

    funcByUrl(method: string, url: Url) : [ string[], ServiceFunction<TAdapter> ] | undefined {
        const pathMap = this.methodFuncs[method];
        if (!pathMap) return undefined;
        const matchPath = longestMatchingPath(pathMap, url.servicePath);
        if (!matchPath) return undefined;
        const matchPathElements = matchPath.split('/').filter(el => !!el);
        return [ matchPathElements, pathMap[matchPath] ];
    }

    func: ServiceFunction<TAdapter> = (msg: Message, context: ServiceContext<TAdapter>, config: IServiceConfig) => {
        const method = msg.method.toLowerCase();
        const callMethodFunc = ([ matchPathElements, func ]: [ string[], ServiceFunction<TAdapter> ],
            msg: Message, context: ServiceContext<TAdapter>, config: IServiceConfig) => {
            msg.url.basePathElements = msg.url.basePathElements.concat(matchPathElements);
            return func(msg, context, config);
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
        if (method === 'put' && this.methodFuncs['post']) {
            pathFunc = this.funcByUrl('post', msg.url);
            if (!pathFunc) return Promise.resolve(msg.setStatus(404, 'Not found'));
            return callMethodFunc(pathFunc, msg, context, config).then(msg => {
                if (msg.data) msg.data.data = null;
                return msg;
            });
        }
        if (method === 'head') {
            pathFunc = this.funcByUrl('get', msg.url) || this.funcByUrl('all', msg.url);
            if (pathFunc) {
                return callMethodFunc(pathFunc, msg, context, config).then(msg => {
                    if (msg.data) msg.data.data = null;
                    return msg;
                });
            } else {
                return Promise.resolve(msg.setStatus(405, 'Method not allowed'));
            }
        }
        if (this.methodFuncs['all']) {
            pathFunc = this.funcByUrl('all', msg.url);
            if (!pathFunc) return Promise.resolve(msg.setStatus(404, 'Not found'));
            return callMethodFunc(pathFunc, msg, context, config);
        }
        return Promise.resolve(msg.setStatus(405, 'Method not allowed'));
    }

    authType: (msg: Message) => Promise<AuthorizationType> = (msg: Message) => { // returns promise as overrides may need to be async
        switch (msg.method) {
            case "OPTIONS": return Promise.resolve(AuthorizationType.none);
            case "GET": case "HEAD": case "POST": return Promise.resolve(AuthorizationType.read);
            default: return Promise.resolve(AuthorizationType.write);
        }
    }

    setMethodPath(method: string, path: string, func: ServiceFunction<TAdapter>) {
        if (this.methodFuncs[method]) {
            this.methodFuncs[method][path] = func;
        } else {
            this.methodFuncs[method] = { [path]: func };
        }
        return this;
    }

    get = (func: ServiceFunction<TAdapter>) => this.setMethodPath('get', '/', func);

    getPath = (path: string, func: ServiceFunction<TAdapter>) => this.setMethodPath('get', path, func);

    getDirectory = (func: ServiceFunction<TAdapter>) => this.setMethodPath('getDirectory', '/', func);
    
    post = (func: ServiceFunction<TAdapter>) => this.setMethodPath('post', '/', func);

    postPath = (path: string, func: ServiceFunction<TAdapter>) => this.setMethodPath('post', path, func);
    
    postDirectory = (func: ServiceFunction<TAdapter>) => this.setMethodPath('postDirectory', '/', func);

    put = (func: ServiceFunction<TAdapter>) => this.setMethodPath('put', '/', func);

    putPath = (path: string, func: ServiceFunction<TAdapter>) => this.setMethodPath('put', path, func);

    putDirectory = (func: ServiceFunction<TAdapter>) => this.setMethodPath('putDirectory', '/', func);

    delete = (func: ServiceFunction<TAdapter>) => this.setMethodPath('delete', '/', func);

    deletePath = (path: string, func: ServiceFunction<TAdapter>) => this.setMethodPath('delete', path, func);

    deleteDirectory = (func: ServiceFunction<TAdapter>) => this.setMethodPath('deleteDirectory', '/', func);

    all = (func: ServiceFunction<TAdapter>) => this.setMethodPath('all', '/', func);

    allPath = (path: string, func: ServiceFunction<TAdapter>) => this.setMethodPath('all', path, func);
}

export type MessageFunction = (msg: Message) => Promise<Message>;