export interface IServiceConfig {
    name: string;
    source: string;
    basePath: string;
    adapterSource?: string;
    infraName?: string;
    adapterConfig?: Record<string, unknown>;
}