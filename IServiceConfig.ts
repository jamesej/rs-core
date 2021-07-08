import { PipelineSpec } from "./PipelineSpec.ts";

export type PrePost = "pre" | "post";

export interface IServiceConfig {
    name: string;
    source: string;
    basePath: string;
    adapterSource?: string;
    infraName?: string;
    adapterConfig?: Record<string, unknown>;
    manifestConfig?: IConfigFromManifest;
    // automatically set to position of service in private service pipeline to enable pre-write and post-read in one service
    prePost?: PrePost;
}

export interface IConfigFromManifest {
    privateServiceConfigs?: Record<string, IServiceConfig>;
    prePipeline?: PipelineSpec;
    postPipeline?: PipelineSpec;
}

export interface IServiceConfigTemplate {
    name: string;
    source: string;
    basePath: unknown;
    adapterSource?: string;
    infraName?: string;
    adapterConfig?: Record<string, unknown>;
}

export const schemaIServiceConfig = {
    "type": "object",
    "properties": {
        "name": { "type": "string" },
        "source": { "type": "string" },
        "basePath": { "type": "string" },
        "adapterSource": { "type": "string"},
        "infraName": { "type": "string" },
        "adapterConfig": { "type": "object", "properties": {} },
        "prePost": { "type": "string", "enum": [ "pre", "post" ] }
    },
    "required": [ "name", "moduleSource", "basePath" ]
}