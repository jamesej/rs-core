import { ItemMetadata } from "../ItemMetadata.ts";
import { MessageBody } from "../MessageBody.ts";
import { IAdapter } from "./IAdapter.ts";

export interface IDataAdapter extends IAdapter { 
    readKey: (dataset: string, key: string) => Promise<Record<string, unknown>>;
    listDataset: (dataset: string) => Promise<string[]>;
    writeKey: (dataset: string, key: string, data: MessageBody) => Promise<number>;
    deleteKey: (dataset: string, key: string) => Promise<number>;
    deleteDataset: (dataset: string) => Promise<number>;
    checkKey: (dataset: string, key: string) => Promise<ItemMetadata>;
}