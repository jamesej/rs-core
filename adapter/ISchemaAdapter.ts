import { ItemMetadata } from "../ItemMetadata.ts";
import { IAdapter } from "./IAdapter.ts";

export interface ISchemaAdapter extends IAdapter {
    readSchema(dataset: string): Promise<Record<string, unknown> | number>;
    writeSchema(dataset: string, schema: Record<string, unknown>): Promise<number>;
    checkSchema(dataset: string): Promise<ItemMetadata>;
    instanceContentType(dataset: string, baseUrl: string): Promise<string>;
}