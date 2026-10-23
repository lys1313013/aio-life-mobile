import type { Coordinate, Footprint } from './model.ts';

export interface FootprintMapHandle {
  setRecords(records: Footprint[], selected: null | string): void;
  setPick(point: Coordinate | null): void;
  setPicking(enabled: boolean): void;
  focus(points: Coordinate[], zoom?: number): void;
  china(): void;
  zoomIn(): void;
  zoomOut(): void;
  setDark(dark: boolean): void;
  destroy(): void;
}
