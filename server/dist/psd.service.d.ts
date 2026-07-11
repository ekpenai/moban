export declare class PsdService {
    private readonly logger;
    parsePsd(filePath: string): Promise<{
        width: any;
        height: any;
        layers: any[];
    }>;
    private parseWithAgPsd;
    private shouldFallbackToWebtoon;
    private parseWithWebtoon;
    private compositeWebtoonLayerToDataUrl;
}
