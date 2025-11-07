import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BranchService } from '../../services/branch.service';
import { Branch, HourlyStat } from '../../models/branch.model';

@Component({
  selector: 'app-branch-detail',
  templateUrl: './branch-detail.component.html',
  styleUrls: ['./branch-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
})
export class BranchDetailComponent {
  private route = inject(ActivatedRoute);
  private branchService = inject(BranchService);

  branchId = signal('');
  branch = computed(() => {
    const id = this.branchId();
    if (id) {
      // Since getBranchById returns a computed, we need to call it to get the value
      return this.branchService.getBranchById(id)();
    }
    return undefined;
  });
  
  hourlyStats = signal<HourlyStat[]>([]);

  maxHourlyIn = computed(() => Math.max(...this.hourlyStats().map(s => s.ins), 0));

  pieChartStyle = computed(() => {
    const branchData = this.branch();
    if (!branchData) return {};
    const malePercent = branchData.stats.genderRatio.male * 100;
    return {
      'background': `conic-gradient(#1178C0 ${malePercent}%, #60a5fa 0)`
    };
  });

  constructor() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.branchId.set(id);
        this.hourlyStats.set(this.branchService.getHourlyStats(id));
      }
    });
  }

  getBarHeight(value: number, max: number): string {
    if (max === 0) return '0%';
    return `${(value / max) * 100}%`;
  }
}
