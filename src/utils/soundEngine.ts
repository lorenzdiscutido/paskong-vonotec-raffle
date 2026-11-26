interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

class WishSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNodes: Set<{ node: AudioScheduledSourceNode; gain: GainNode }> = new Set();
  private noiseBuffer: AudioBuffer | null = null;
  public enabled = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.52;
      this.masterGain.connect(compressor);
      compressor.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch((err) => {
        console.warn('[sound] AudioContext resume blocked:', err);
      });
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType = 'sine',
    peakGain = 0.16,
    isSequence = false
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    if (isSequence) {
      const entry = { node: osc, gain };
      this.activeNodes.add(entry);
      osc.onended = () => {
        this.activeNodes.delete(entry);
      };
    }

    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  private playPitchSweep(
    startFreq: number,
    endFreq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType,
    peakGain: number,
    isSequence = true
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    const safePeak = Math.max(0.0001, peakGain);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(safePeak, now + Math.min(0.08, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    if (isSequence) {
      const entry = { node: osc, gain };
      this.activeNodes.add(entry);
      osc.onended = () => {
        this.activeNodes.delete(entry);
      };
    }

    osc.start(now);
    osc.stop(now + duration + 0.04);
  }

  private playNoiseSweep(
    startOffset: number,
    duration: number,
    startFreq: number,
    endFreq: number,
    peakGain: number,
    q = 2.2,
    isSequence = true
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime + startOffset;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(20, startFreq), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    const gain = ctx.createGain();
    const safePeak = Math.max(0.0001, peakGain);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(safePeak, now + Math.min(0.06, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    if (isSequence) {
      const entry = { node: src, gain };
      this.activeNodes.add(entry);
      src.onended = () => {
        this.activeNodes.delete(entry);
      };
    }

    src.start(now);
    src.stop(now + duration + 0.04);
  }

  /**
   * Smoothly fades out and stops all scheduled meteor-sequence nodes (e.g. when skipping).
   */
  public stopSequenceAudio() {
    if (!this.ctx) {
      this.activeNodes.clear();
      return;
    }
    const now = this.ctx.currentTime;
    for (const entry of this.activeNodes) {
      try {
        entry.gain.gain.cancelScheduledValues(now);
        entry.gain.gain.setValueAtTime(Math.max(0.0001, entry.gain.gain.value), now);
        entry.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
        entry.node.stop(now + 0.035);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'InvalidStateError')) {
          console.warn('[sound] Failed to stop audio node:', err);
        }
      }
    }
    this.activeNodes.clear();
  }

  public playUiClick() {
    this.playTone(1046.5, 0, 0.1, 'sine', 0.11, false);
    this.playTone(1567.98, 0.025, 0.13, 'triangle', 0.07, false);
  }

  public playCountdownTick(isGo: boolean) {
    if (isGo) {
      this.playTone(523.25, 0, 0.25, 'triangle', 0.18, true);
      this.playTone(783.99, 0.04, 0.35, 'triangle', 0.18, true);
      this.playTone(1046.5, 0.08, 0.55, 'sine', 0.16, true);
    } else {
      this.playTone(587.33, 0, 0.16, 'sine', 0.15, true);
    }
  }

  public playBoostSfx() {
    this.playPitchSweep(360, 880, 0, 0.35, 'triangle', 0.12, true);
    this.playTone(1174.66, 0.08, 0.3, 'sine', 0.09, true);
  }

  public playSlipSfx() {
    this.playPitchSweep(460, 130, 0, 0.32, 'sawtooth', 0.07, true);
    this.playNoiseSweep(0.02, 0.28, 1400, 320, 0.1, 1.8, true);
  }

  public playPhotoFinishHeartbeat() {
    this.playTone(62.0, 0, 0.28, 'sine', 0.28, true);
    this.playTone(55.0, 0.22, 0.34, 'sine', 0.22, true);
    this.playNoiseSweep(0, 0.55, 600, 1800, 0.08, 2.2, true);
  }

  public playSummitVictory(isChristmas: boolean) {
    this.playTone(65.41, 0, 0.65, 'sine', 0.3, false);
    this.playTone(130.81, 0, 0.45, 'triangle', 0.18, false);
    this.playNoiseSweep(0.05, 0.9, 500, 2200, 0.09, 1.5, false);

    const chord = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f, i) => {
      this.playTone(f, 0.04 + i * 0.04, 1.35, 'triangle', 0.13, false);
      if (isChristmas && i % 2 === 1) {
        this.playTone(f * 2, 0.08 + i * 0.04, 0.65, 'sine', 0.045, false);
      }
    });
  }

  public playCardUnveil() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      this.playTone(freq, idx * 0.045, 0.75, 'sine', 0.11, false);
    });
  }
}

export const wishSound = new WishSoundEngine();
