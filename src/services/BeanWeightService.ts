import type { BeanInfo } from '../brew/types';
import type { Result } from '../types/result';

export interface BeanWeightService {
	getAllBeans(): BeanInfo[];
	setWeight(path: string, weight: number | null): Promise<Result<void>>;
}
