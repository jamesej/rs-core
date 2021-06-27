import { MessageBody } from "@restspace/rs-runlib";
import { IAdapter } from "./IAdapter";
import { IReadConfigAdapter, IWriteConfigAdapter } from "./IConfigAdapter";
import { ISummaryAdapter } from "./ISummaryAdapter";
import { ItemMetadata } from "./itemMetadata";

export enum DirResultType {
    listing, query
}

export interface IDataSpaceAdapter extends IAdapter, IReadConfigAdapter {
    /** Throws 'Not found' if no data on path */
    read: (tenant: string, path: string) => Promise<any>;
    readDirectory: (tenant: string, path: string) => Promise<[DirResultType, any]>;
    write: (tenant: string, path: string, data: MessageBody) => Promise<number>;
    delete: (tenant: string, path: string) => Promise<number>;
    /** Won't delete subdirectories, or contained files other than those whose names end in deleteableFileSuffix */
    deleteDirectory: (tenant: string, path: string, deleteableFileSuffix?: string) => Promise<number>;
    check: (tenant: string, path: string) => Promise<ItemMetadata>;
    isConfig: (path: string) => boolean;
    configResourceName: string;
    schemaConfigAdapter: IReadConfigAdapter;
    summaryAdapter: ISummaryAdapter;
}