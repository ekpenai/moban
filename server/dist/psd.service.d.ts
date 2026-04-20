export declare class PsdService {
    private readonly logger;
    parsePsd(filePath: string): Promise<{
        width: number;
        height: number;
        layers: any[];
    }>;
}
