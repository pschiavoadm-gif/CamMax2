export interface Branch {
  id: string;
  name: string;
  location: string;
  cameraStatus: 'online' | 'offline';
  stats: BranchStats;
}

export interface BranchStats {
  currentPeople: number;
  totalInToday: number;
  totalOutToday: number;
  avgDwellTime: number; // in seconds
}

export interface DetectionEvent {
  personId: string;
  event: 'in' | 'out';
  dwellTime: number; // in seconds
  timestamp: Date;
}

export interface HourlyStat {
  hour: number;
  ins: number;
  outs: number;
  avgDwell: number;
}