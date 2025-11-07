import { Component, ChangeDetectionStrategy, ElementRef, ViewChild, OnDestroy, AfterViewInit, inject, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BranchService } from '../../services/branch.service';

// To inform TypeScript about the mediapipe library loaded from the CDN
declare var mediapipe: any;

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
  
  private objectDetector: any;
  private runningMode: 'IMAGE' | 'VIDEO' = 'VIDEO';
  private animationFrameId: number | null = null;
  private lastVideoTime = -1;

  private trackedPeople = new Map<number, TrackedPerson>();
  private nextId = 1;
  private readonly INACTIVITY_THRESHOLD = 2000; // ms

  constructor() {
    this.branchId.set(this.route.snapshot.paramMap.get('id'));
  }

  async ngAfterViewInit() {
    await this.initializeMediaPipe();
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
    if (this.objectDetector) {
        this.objectDetector.close();
    }
  }

  private async initializeMediaPipe() {
    try {
      const { ObjectDetector, FilesetResolver } = mediapipe.tasks.vision;
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm'
      );
      this.objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
          delegate: 'GPU',
        },
        runningMode: this.runningMode,
        scoreThreshold: 0.5,
        categoryAllowlist: ['person'],
      });
    } catch (e) {
        this.handleError('Failed to initialize MediaPipe AI model.', e);
    }
  }

  private async enableCam() {
    if (!this.objectDetector) {
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

  private predictWebcam() {
    const video = this.videoElement.nativeElement;
    if (video.paused || video.ended || this.status() !== 'running' || video.readyState < 2) {
      this.animationFrameId = requestAnimationFrame(() => this.predictWebcam());
      return;
    }

    const canvas = this.canvasElement.nativeElement;
    const ctx = canvas.getContext('2d')!;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const now = performance.now();
    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      const detections = this.objectDetector.detectForVideo(video, now);
      this.processDetections(detections.detections);
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw the video frame to the canvas first
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    this.drawDetections(ctx);
    this.cdr.detectChanges();

    this.animationFrameId = requestAnimationFrame(() => this.predictWebcam());
  }
  
  private processDetections(detections: any[]) {
    const now = Date.now();
    // Map mediapipe's boundingBox (with originX/originY) to our internal box model (with x/y).
    const currentFrameBoxes: { x: number, y: number, width: number, height: number, cx: number, cy: number }[] = detections
      .filter(d => d.boundingBox) // Ensure bounding box exists
      .map(d => {
        const box = d.boundingBox;
        return { x: box.originX, y: box.originY, width: box.width, height: box.height, cx: box.originX + box.width / 2, cy: box.originY + box.height / 2 };
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