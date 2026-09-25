/**
 * ARES Tactical C2 - Procedural Web Audio Sound Effects Synthesizer
 * 100% Native Web Audio API - Zero external MP3/WAV dependencies.
 * Produces crisp, professional military/aerospace acoustic feedback.
 */

class TacticalAudioService {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private lastAlarmTime: number = 0;

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Radio Squelch / Roger Beep:
   * Short VHF tactical radio chirp with subtle noise burst.
   */
  public playRadioChirp() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // Dual-tone pip
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1440, t);
      osc1.frequency.exponentialRampToValueAtTime(1880, t + 0.05);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(960, t);
      osc2.frequency.exponentialRampToValueAtTime(1240, t + 0.05);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.08);
      osc2.stop(t + 0.08);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  /**
   * Sonar / Radar Ping:
   * Resonant low-frequency acoustic sweep with smooth decay.
   */
  public playSonarPing() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.25);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.45);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  /**
   * Target Lock-On Tone:
   * Two rapid high-tech acquisition chirps for GOTO assignment or unit selection.
   */
  public playLockOn() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // Pulse 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(1800, t);
      gain1.gain.setValueAtTime(0.05, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.045);

      // Pulse 2 (higher)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(2400, t + 0.06);
      gain2.gain.setValueAtTime(0.07, t + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.06);
      osc2.stop(t + 0.12);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  /**
   * Proximity Collision Warning (Klaxon):
   * Rapid high-urgency alternating tone for 15m safety bubble breach.
   */
  public playCollisionAlarm() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = Date.now();
    if (now - this.lastAlarmTime < 1800) return; // Cooldown to avoid ear fatigue
    this.lastAlarmTime = now;

    try {
      const t = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const offset = i * 0.18;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, t + offset);
        osc.frequency.setValueAtTime(620, t + offset + 0.08);

        gain.gain.setValueAtTime(0.12, t + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t + offset);
        osc.stop(t + offset + 0.16);
      }
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  /**
   * Mechanical Camera Shutter:
   * Double click simulating high-speed optical iris snapshot.
   */
  public playCameraShutter() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // Shutter click 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(2800, t);
      osc1.frequency.exponentialRampToValueAtTime(600, t + 0.03);
      gain1.gain.setValueAtTime(0.15, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.03);

      // Shutter click 2
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1900, t + 0.045);
      osc2.frequency.exponentialRampToValueAtTime(400, t + 0.08);
      gain2.gain.setValueAtTime(0.12, t + 0.045);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.045);
      osc2.stop(t + 0.08);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  /**
   * Tactical Button Press Click
   */
  public playButtonBeep() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, t);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.035);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }
}

export const tacticalAudio = new TacticalAudioService();
