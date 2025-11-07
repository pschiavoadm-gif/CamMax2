import { Injectable, signal, computed } from '@angular/core';
import { Branch, HourlyStat } from '../models/branch.model';

const MOCK_BRANCHES: Branch[] = [
  { id: 'branch_01', name: 'Centro Histórico', location: 'Ciudad de México, MX', cameraStatus: 'online', stats: { currentPeople: 12, totalInToday: 152, totalOutToday: 140, avgDwellTime: 180 } },
  { id: 'branch_02', name: 'Westside Mall', location: 'Los Angeles, CA', cameraStatus: 'online', stats: { currentPeople: 25, totalInToday: 320, totalOutToday: 295, avgDwellTime: 320 } },
  { id: 'branch_03', name: 'Plaza del Norte', location: 'Madrid, ES', cameraStatus: 'offline', stats: { currentPeople: 0, totalInToday: 88, totalOutToday: 88, avgDwellTime: 210 } },
  { id: 'branch_04', name: 'Centro Comercial Sur', location: 'Buenos Aires, AR', cameraStatus: 'online', stats: { currentPeople: 18, totalInToday: 210, totalOutToday: 192, avgDwellTime: 250 } },
];

const MOCK_HOURLY_DATA: { [key: string]: HourlyStat[] } = {
  'branch_01': Array.from({ length: 24 }, (_, i) => ({ hour: i, ins: Math.floor(Math.random() * 20), outs: Math.floor(Math.random() * 20), avgDwell: 150 + Math.floor(Math.random() * 60) })),
  'branch_02': Array.from({ length: 24 }, (_, i) => ({ hour: i, ins: Math.floor(Math.random() * 35), outs: Math.floor(Math.random() * 35), avgDwell: 280 + Math.floor(Math.random() * 80) })),
  'branch_03': Array.from({ length: 24 }, (_, i) => ({ hour: i, ins: 0, outs: 0, avgDwell: 0 })),
  'branch_04': Array.from({ length: 24 }, (_, i) => ({ hour: i, ins: Math.floor(Math.random() * 25), outs: Math.floor(Math.random() * 25), avgDwell: 220 + Math.floor(Math.random() * 70) })),
};

@Injectable({
  providedIn: 'root'
})
export class BranchService {
  private readonly _branches = signal<Branch[]>(MOCK_BRANCHES);
  readonly branches = this._branches.asReadonly();

  readonly globalTotalPeople = computed(() => 
    this.branches().reduce((acc, branch) => acc + (branch.cameraStatus === 'online' ? branch.stats.currentPeople : 0), 0)
  );

  constructor() {
    // Simulate real-time updates
    setInterval(() => {
      this._branches.update(branches =>
        branches.map(branch => {
          if (branch.cameraStatus === 'online') {
            const change = Math.random() > 0.5 ? 1 : -1;
            const newCount = Math.max(0, branch.stats.currentPeople + change);
            const newStats = { ...branch.stats, currentPeople: newCount };
            if (change > 0) newStats.totalInToday++; else newStats.totalOutToday++;
            return { ...branch, stats: newStats };
          }
          return branch;
        })
      );
    }, 3000);
  }

  getBranchById(id: string) {
    return computed(() => this.branches().find(b => b.id === id));
  }

  getHourlyStats(branchId: string) {
    return MOCK_HOURLY_DATA[branchId] || [];
  }

  personEvent(branchId: string, event: 'in' | 'out') {
    this._branches.update(branches =>
      branches.map(branch => {
        if (branch.id === branchId) {
          const newStats = { ...branch.stats };
          if (event === 'in') {
            newStats.currentPeople++;
            newStats.totalInToday++;
          } else {
            newStats.currentPeople = Math.max(0, newStats.currentPeople - 1);
            newStats.totalOutToday++;
          }
          return { ...branch, stats: newStats };
        }
        return branch;
      })
    );
  }
}