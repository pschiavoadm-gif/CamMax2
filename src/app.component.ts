import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  OnDestroy,
  AfterViewInit,
  signal,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  private cdr = inject(ChangeDetectorRef);

  status = signal<'loading' | 'running' | 'error' | 'no_camera'>('loading');
  errorMessage = signal<string>('');
  
  async ngAfterViewInit() {
    await this.enableCam();
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  private async enableCam() {
    this.status.set('loading');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        this.videoElement.nativeElement.srcObject = stream;
        this.videoElement.nativeElement.addEventListener('loadeddata', () => {
          this.status.set('running');
          this.cdr.detectChanges();
        });
      } catch (err) {
        this.handleError('Camera access was denied. Please allow camera permissions in your browser settings.', err);
        this.status.set('no_camera');
      }
    } else {
        this.handleError('Your browser does not support camera access (getUserMedia).');
        this.status.set('no_camera');
    }
  }
  
  private stopCamera() {
    const video = this.videoElement?.nativeElement;
    if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
  }

  private handleError(message: string, error?: any) {
    this.status.set('error');
    this.errorMessage.set(message);
    if (error) console.error(message, error);
    this.cdr.detectChanges();
  }
}