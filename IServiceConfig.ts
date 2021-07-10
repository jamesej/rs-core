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