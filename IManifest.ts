import { IServiceConfig, IServiceConfigTemplate } from "rs-core/IServiceConfig.ts";
import { PipelineSpec } from "rs-core/PipelineSpec.ts";

export interface IManifest {
    name: string;
    description: string;
    // Url or relative file path to module's .ts file
    moduleUrl?: string;
    // JSON Schema for configuration
    configSchema: Record<string, unknown>;
    defaults?: Partial<IServiceConfig>;
}

export interface IServiceManifest extends IManifest {
    apis?: string[];
    adapterInterface?: string;
    privateServices?: Record<string, IServiceConfigTemplate>;
    prePipeline?: PipelineSpec;
    postPipeline?: PipelineSpec;
    exposedConfigProperties?: string[];
    isFilter?: boolean;
}

export interface IAdapterManifest extends IManifest {
    adapterInterfaces: string[];
}