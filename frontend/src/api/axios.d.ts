import type { AxiosInstance } from 'axios';

declare const api: AxiosInstance;

export function downloadFile(url: string, filename: string, options?: { open?: boolean }): Promise<void>;

export default api;
