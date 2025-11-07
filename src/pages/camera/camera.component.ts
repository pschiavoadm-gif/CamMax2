import { Component, ChangeDetectionStrategy, ElementRef, ViewChild, OnDestroy, AfterViewInit, inject, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BranchService } from '../../services/branch.service';

// To inform TypeScript about the TensorFlow.js and coco-ssd libraries loaded from the CDN
declare var tf: any;
declare var cocoSsd: any;

interface TrackedPerson {
  id: number;
  box: { x: number, y: number, width: number, height: number, cx: number, cy: number };
  gender: 'male' | 'female';
  age: number;
  startTime: number;
  lastSeen: number;
}

@Component({
  selector: 'app-camera',
  templateUrl: './camera.component.html',
  styleUrls: ['./camera.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
})
export class CameraComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  private route = inject(ActivatedRoute);
  private branchService = inject(BranchService);
  private cdr = inject(ChangeDetectorRef);

  branchId = signal<string | null>(null);
  branch = this.branchService.getBranchById(this.branchId() || '');

  status = signal<'loading' | 'running' | 'error' | 'no_camera'>('loading');
  errorMessage = signal<string>('');
  debugData = signal<TrackedPerson[]>([]);
  
  private model: any;
  private animationFrameId: number | null = null;
  private isDetecting = false;

  private trackedPeople = new Map<number, TrackedPerson>();
  private nextId = 1;
  private readonly INACTIVITY_THRESHOLD = 2000; // ms
  private readonly SCORE_THRESHOLD = 0.5;

  constructor() {
    this.branchId.set(this.route.snapshot.paramMap.get('id'));
  }

  async ngAfterViewInit() {
    await this.initializeAiModel();
    await this.enableCam();
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    const video = this.videoElement?.nativeElement;
    if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
  }

  getDebugJSON(): string {
    return JSON.stringify(this.debugData(), null, 2);
  }

  private async initializeAiModel() {
    try {
      // Load the COCO-SSD model.
      this.model = await cocoSsd.load();
    } catch (e) {
        this.handleError('Failed to initialize TensorFlow.js AI model.', e);
    }
  }

  private async enableCam() {
    if (!this.model) {
      this.handleError('AI model not ready.');
      return;
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        this.videoElement.nativeElement.srcObject = stream;
        this.videoElement.nativeElement.addEventListener('loadeddata', () => {
          this.status.set('running');
          this.predictWebcam();
        });
      } catch (err) {
        this.handleError('Camera access was denied. Please allow camera permissions.', err);
        this.status.set('no_camera');
      }
    } else {
        this.handleError('Your browser does not support camera access.');
        this.status.set('no_camera');
    }
  }

  private async predictWebcam() {
    const video = this.videoElement.nativeElement;
    if (video.paused || video.ended || this.status() !== 'running' || video.readyState < 2) {
      this.animationFrameId = requestAnimationFrame(() => this.predictWebcam());
      return;
    }

    // Run detection asynchronously
    if (!this.isDetecting) {
        this.isDetecting = true;
        const predictions = await this.model.detect(video);
        this.processDetections(predictions);
        this.isDetecting = false;
    }
    
    // Drawing logic
    const canvas = this.canvasElement.nativeElement;
    const ctx = canvas.getContext('2d')!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    this.drawDetections(ctx);
    this.cdr.detectChanges();

    this.animationFrameId = requestAnimationFrame(() => this.predictWebcam());
  }
  
  private processDetections(predictions: any[]) {
    const now = Date.now();
    const currentFrameBoxes: { x: number, y: number, width: number, height: number, cx: number, cy: number }[] = predictions
      .filter(p => p.class === 'person' && p.score > this.SCORE_THRESHOLD)
      .map(p => {
          const [x, y, width, height] = p.bbox;
          return { x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
      });
    
    const matchedIds = new Set<number>();

    // Try to match new detections with existing tracked people
    for (const newBox of currentFrameBoxes) {
      let bestMatch: { id: number; dist: number } | null = null;
      for (const [id, person] of this.trackedPeople.entries()) {
        const dist = Math.hypot(newBox.cx - person.box.cx, newBox.cy - person.box.cy);
        // Use a threshold for matching (e.g., 50 pixels)
        if (dist < 50 && (bestMatch === null || dist < bestMatch.dist)) {
            bestMatch = { id, dist };
        }
      }

      if (bestMatch && !matchedIds.has(bestMatch.id)) {
        const person = this.trackedPeople.get(bestMatch.id)!;
        person.box = newBox;
        person.lastSeen = now;
        matchedIds.add(bestMatch.id);
      } else {
        // New person detected
        const newPerson: TrackedPerson = {
          id: this.nextId++,
          box: newBox,
          gender: Math.random() > 0.5 ? 'male' : 'female',
          age: Math.floor(18 + Math.random() * 50),
          startTime: now,
          lastSeen: now,
        };
        this.trackedPeople.set(newPerson.id, newPerson);
        this.branchService.personEvent(this.branchId()!, 'in');
      }
    }
    
    // Check for people who have left the frame
    for (const [id, person] of this.trackedPeople.entries()) {
      if (now - person.lastSeen > this.INACTIVITY_THRESHOLD) {
        this.trackedPeople.delete(id);
        this.branchService.personEvent(this.branchId()!, 'out');
      }
    }

    this.debugData.set(Array.from(this.trackedPeople.values()));
  }

  private drawDetections(ctx: CanvasRenderingContext2D) {
    const now = Date.now();
    for (const person of this.trackedPeople.values()) {
        const box = person.box;
        ctx.strokeStyle = '#1178C0';
        ctx.lineWidth = 4;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        const dwellTime = ((now - person.startTime) / 1000).toFixed(0);
        const label = `ID ${person.id} | ${person.gender} | ${person.age}y | ${dwellTime}s`;
        
        ctx.fillStyle = '#1178C0';
        ctx.font = '14px Inter, sans-serif';
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(box.x, box.y - 20, textWidth + 10, 20);
        ctx.fillStyle = 'white';
        ctx.fillText(label, box.x + 5, box.y - 5);
    }
  }

  private handleError(message: string, error?: any) {
    this.status.set('error');
    this.errorMessage.set(message);
    if (error) console.error(message, error);
    this.cdr.detectChanges();
  }
}