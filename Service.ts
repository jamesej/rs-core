import { IServiceConfig } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { PipelineSpec } from "./PipelineSpec.ts";
import { Source } from "./Source.ts";
import { Url } from "./Url.ts";

export interface ServiceContext {
    tenant: string;
    call: (msg: Message, source: Source) => Promise<Message>;
    runPipeline: (msg: Message, pipelineSpec: PipelineSpec, contextUrl?: Url, concurrencyLimit?: number) => Promise<Message>;
}

export type ServiceFunction = (msg: Message, context: ServiceContext, config: IServiceConfig) => Promise<Message>;

export enum AuthorizationType {
    none, read, write, create
}

interface MethodFuncs {
    get?: ServiceFunction;
    post?: ServiceFunction;
    put?: ServiceFunction;
    all?: ServiceFunction;
}

export class Service {
    methodFuncs: { [ method: string ]: ServiceFunction } = {};
    apis: string[] = [];

    func: ServiceFunction = async (msg: Message, context: ServiceContext, config: IServiceConfig) => {
        const methodFunc = this.methodFuncs[msg.method.toLowerCase()];
        if (methodFunc) return methodFunc(msg, context, config);
        if (this.methodFuncs['all']) return this.methodFuncs['all'](msg, context, config);
        return msg.setStatus(404, 'Not found');
    }

    authType: (msg: Message) => Promise<AuthorizationType> = async (msg: Message) => { // async as overrides may need to be async
        switch (msg.method) {
            case "OPTIONS": return AuthorizationType.none;
            case "GET": case "HEAD": case "POST": return AuthorizationType.read;
            default: return AuthorizationType.write;
        }
    }

    get(func: ServiceFunction) {
        this.methodFuncs['get'] = func;
        return this;
    }
    post(func: ServiceFunction) {
        this.methodFuncs['post'] = func;
        return this;
    }
    put(func: ServiceFunction) {
        this.methodFuncs['put'] = func;
        return this;
    }
    all(func: ServiceFunction) {
        this.methodFuncs['all'] = func;
        return this;
    }

    setApis(...apiNames: string[]) {
        this.apis = apiNames;
        return this;
    }
}

export type MessageFunction = (msg: Message) => Promise<Message>;