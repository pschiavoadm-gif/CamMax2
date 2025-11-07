import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BranchService } from '../../services/branch.service';

@Component({
  selector: 'app-config',
  templateUrl: './config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class ConfigComponent {
  private branchService = inject(BranchService);
  branches = this.branchService.branches;

  toggleCameraStatus(branchId: string) {
    this.branchService.toggleCameraStatus(branchId);
  }
}