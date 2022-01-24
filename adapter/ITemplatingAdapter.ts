import { IAdapter } from "./IAdapter.ts";

export interface ITemplatingAdapter extends IAdapter {
	fillTemplate(data: any, template: string): Promise<string>;
}