import { IAdapter } from "./adapter/IAdapter.ts";
import { IServiceConfig } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { PipelineSpec } from "./PipelineSpec.ts";
import { Source } from "./Source.ts";
import { Url } from "./Url.ts";

export interface SimpleServiceContext {
    tenant: string;
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

interface MethodFuncs {
    get?: ServiceFunction;
    post?: ServiceFunction;
    put?: ServiceFunction;
    all?: ServiceFunction;
}

export class Service<TAdapter extends IAdapter = IAdapter> {
    methodFuncs: { [ method: string ]: ServiceFunction<TAdapter> } = {};

    func: ServiceFunction<TAdapter> = (msg: Message, context: ServiceContext<TAdapter>, config: IServiceConfig) => {
        const method = msg.method.toLowerCase();
        if (msg.url.isDirectory) {
            const dirFunc = this.methodFuncs[method + 'Directory'];
            if (dirFunc) {
                return dirFunc(msg, context, config);
            }
        }
        const methodFunc = this.methodFuncs[method];
        if (methodFunc) return methodFunc(msg, context, config);
        // default put is post with no returned body
        if (method === 'put' && this.methodFuncs['post']) {
            return this.methodFuncs['post'](msg, context, config).then(msg => {
                if (msg.data) msg.data.data = null;
                return msg;
            });
        }
        if (this.methodFuncs['all']) return this.methodFuncs['all'](msg, context, config);
        return Promise.resolve(msg.setStatus(404, 'Not found'));
    }

    authType: (msg: Message) => Promise<AuthorizationType> = (msg: Message) => { // returns promise as overrides may need to be async
        switch (msg.method) {
            case "OPTIONS": return Promise.resolve(AuthorizationType.none);
            case "GET": case "HEAD": case "POST": return Promise.resolve(AuthorizationType.read);
            default: return Promise.resolve(AuthorizationType.write);
        }
    }

    get(func: ServiceFunction<TAdapter>) {
        this.methodFuncs['get'] = func;
        return this;
    }
    getDirectory(func: ServiceFunction<TAdapter>) {
        this.methodFuncs['getDirectory'] = func;
        return this;
    }
    post(func: ServiceFunction<TAdapter>) {
        this.methodFuncs['post'] = func;
        return this;
    }
    postDirectory(func: ServiceFunction<TAdapter>) {
        this.methodFuncs['postDirectory'] = func;
        return this;
    }
    put(func: ServiceFunction<TAdapter>) {
        this.methodFuncs['put'] = func;
        return this;
    }
    putDirectory(func: ServiceFunction<TAdapter>) {
        this.methodFuncs['putDirectory'] = func;
        return this;
    }
    delete(func: ServiceFunction<TAdapter>) {
        this.methodFuncs['delete'] = func;
        return this;
    }
    deleteDirectory(func: ServiceFunction<TAdapter>) {
        this.methodFuncs['deleteDirectory'] = func;
        return this;
    }
    all(func: ServiceFunction<TAdapter>) {
        this.methodFuncs['all'] = func;
        return this;
    }
}

export type MessageFunction = (msg: Message) => Promise<Message>;